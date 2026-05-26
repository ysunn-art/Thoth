"""
Deterministic risk-classification pre-filter for query routing.

Returns (is_risky: bool, category: str) for a given question string.
- is_risky=True means the question should be escalated to admin.
- Patterns target *action-oriented* phrasing to avoid false positives
  on definition/trivia questions (e.g. "What is a refund?" passes,
  "How do I get a refund?" triggers).

Categories:
  billing     — refund, cancel, charge, pricing, payment
  account     — password, login, 2FA, account changes
  privacy     — personal data, PII, GDPR/CCPA requests
  legal       — legal advice, lawsuits, TOS violations
  security    — exploits, bypass, admin passwords, vulnerabilities
  medical     — diagnosis, medication, symptoms, treatment
  financial   — investment advice, tax, stocks, retirement
  authz       — access grants, permission requests, role changes
  destructive — delete/wipe production data, shutdown servers
  org         — company-specific procedures (expense reports, HR policy)
  self_harm   — suicide, self-harm, abuse (CRITICAL — bypass all)
"""
import re
from typing import Tuple


def check_risk(question: str) -> Tuple[bool, str]:
    """
    Returns (is_risky, category).
    - is_risky=False, category=""  → safe, proceed with classification
    - is_risky=True, category="self_harm" → CRITICAL, admin escalation, no LLM
    - is_risky=True, category=<other> → HIGH-RISK, admin escalation if no RAG
    """
    q = question.lower().strip()

    # ---------------------------------------------------------------
    # TIER 1 — CRITICAL: self-harm / suicide / abuse
    # Near-zero false-positives. Immediate admin, no LLM.
    # ---------------------------------------------------------------
    if _match_any(q, [
        r'\b(kill|hurt|harm)\s+(myself|my.self)\b',
        r'\b(i\s+(want|wanna|going)\s+to\s+(die|end\s+(it|my\s+life)|kill\s+myself))\b',
        r'\b(suicide|suicidal)\b',
        r'\b(self[\s-]?harm)\b',
        r'\b(i\s+(don.t|do\s+not)\s+want\s+to\s+(live|exist))\b',
    ]):
        return True, "self_harm"

    # ---------------------------------------------------------------
    # TIER 2 — HIGH-RISK: action-oriented patterns for 10 categories
    # ---------------------------------------------------------------

    # ---- billing ----
    if _match_any(q, [
        r'\b(how|can|want|would\s+like|need)\s+.{0,20}(get|request|process|obtain)\s.{0,10}(refund|money\s+back)\b',
        r'\b(cancel|stop|terminate)\s.{0,10}(subscription|plan|membership|service)\b',
        r'\b(dispute|wrong|incorrect|unauthorized)\s+(charge|bill|transaction|payment)\b',
        r'\b(i\s+was\s+(charged|billed))\b',
        r'\b(upgrade|downgrade|change)\s.{0,10}(plan|subscription|tier|package)\b',
    ]):
        return True, "billing"

    # ---- account ----
    if _match_any(q, [
        r'\b(reset|change|update|forgot|forgotten|recover)\s.{0,15}(password|passcode|pin|login|credential)\b',
        r'\b(delete|deactivate|remove|close|terminate)\s.{0,10}(my\s+)?(account|profile)\b',
        r'\b(locked|disabled|blocked|suspended|frozen)\s.{0,10}(out\s+of\s+)?(my\s+)?(account|access)\b',
        r'\b(cannot|can.t|unable|can\s+not)\s+(log|sign)\s+(in|on)\b',
        r'\b(change|update)\s.{0,10}(email|phone|username|login)\b',
        r'\b(enable|disable|set\s+up)\s.{0,10}(2fa|mfa|two[\s-]?factor|authenticator)\b',
    ]):
        return True, "account"

    # ---- privacy ----
    if _match_any(q, [
        r'\b(delete|remove|erase|wipe|clear|export|download)\s.{0,15}(my|all\s+my|personal)\s+(data|info|information|record|history)\b',
        r'\b(what|which)\s+(personal|private)\s+(data|info)\s.{0,10}(store|collect|keep|have|hold)\b',
        r'\b(who|which\s+people)\s.{0,10}(see|view|access)\s.{0,10}(my|personal)\s+(data|info|profile)\b',
        r'\b(gdpr|ccpa)\s+(request|right|delete|opt[\s-]?out|erasure)\b',
        r'\b(do\s+not|don.t|stop)\s.{0,10}(sell|share|track)\s.{0,10}(my|personal)\s+(data|info)\b',
    ]):
        return True, "privacy"

    # ---- legal ----
    if _match_any(q, [
        r'\b(need|want|looking\s+for|provide)\s.{0,10}(legal\s+advice)\b',
        r'\b(can|should|how|do)\s.{0,10}(i|we)\s.{0,10}(sue|file\s+a\s+lawsuit)\b',
        r'\b(is\s+(it|this)\s+(legal|illegal|allowed|prohibited))\b',
        r'\b(terms\s+of\s+service|tos)\s+(violation|breach)\b',
        r'\b(compliance|regulatory)\s+(violation|breach|issue)\b',
    ]):
        return True, "legal"

    # ---- security ----
    if _match_any(q, [
        r'\b(bypass|circumvent|disable|override)\s.{0,10}(security|firewall|auth|authentication)\b',
        r'\b(admin|administrator|root)\s+(password|credential|access)\b',
        r'\b(exploit|vulnerability|backdoor|zero[\s-]?day)\b',
        r'\b(how\s+to\s+(hack|break\s+into|crack))\b',
        r'\b(open\s+(port|firewall)|sql\s+injection|xss\s+attack)\b',
    ]):
        return True, "security"

    # ---- medical ----
    if _match_any(q, [
        r'\b(what|which)\s+(medication|medicine|drug|pill)\s.{0,10}(should|can|do)\s.{0,10}(i\s+)?(take|use)\b',
        r'\b(diagnos|diagnose)\s.{0,10}(me|myself|what|this)\b',
        r'\b(i\s+have\s+(a\s+)?(symptom|pain|rash|fever))\b',
        r'\b(prescribe|prescription)\s.{0,10}(me|for)\b',
        r'\b(treatment|treat|cure)\s.{0,10}(for|of)\s.{0,10}(cancer|disease|condition|illness)\b',
        r'\b(drug|medication)\s+(interaction|dosage|side[\s-]?effect)\b',
    ]):
        return True, "medical"

    # ---- financial ----
    if _match_any(q, [
        r'\b(should|ought|do)\s.{0,10}(i|we)\s.{0,10}(invest|buy|sell|trade)\s.{0,10}(in\s+)?(stock|bitcoin|crypto|bond|fund)\b',
        r'\b(financial|investment|stock)\s+(advice|tip|recommendation)\b',
        r'\b(tax\s+(advice|filing|return|planning))\b',
        r'\b(retirement\s+(plan|account|saving|advice))\b',
        r'\b(how\s+to\s+(file|do)\s.{0,10}(tax|return))\b',
    ]):
        return True, "financial"

    # ---- authorization ----
    if _match_any(q, [
        r'\b(give|grant|provide)\s.{0,10}(me|us)\s.{0,10}(admin|administrator|elevated|root)\s+(access|right|privilege|permission)\b',
        r'\b(make|promote)\s.{0,10}(me|myself)\s.{0,10}(admin|administrator|moderator)\b',
        r'\b(can|may|am)\s.{0,10}(i|we)\s.{0,10}(have|get|obtain)\s.{0,10}(access|permission)\s.{0,10}(to\s+)?(the\s+)?(admin|production|prod|sensitive)\b',
        r'\b(i\s+(need|want)\s+(admin|elevated|special)\s+(access|right|privilege))\b',
    ]):
        return True, "authz"

    # ---- destructive ----
    if _match_any(q, [
        r'\b(delete|drop|remove|wipe|nuke|purge|destroy)\s.{0,15}(prod|production|database|db|server|instance)\b',
        r'\b(shut[\s-]?down|restart|reboot|stop)\s.{0,15}(prod|production|server|database|service)\b',
        r'\b(rm\s+[\-]rf|format|reformat|truncate)\b',
        r'\b(run|execute)\s.{0,15}(dangerous|destructive|irreversible)\b',
    ]):
        return True, "destructive"

    # ---- organizational ----
    if _match_any(q, [
        r'\b(how|where).{0,10}(submit|file|process).{0,10}(expense|reimbursement|time[\s-]?off|pto|vacation)\b',
        r'\b(how|what|where).{0,10}(contact|reach).{0,10}(hr|human\s+resources|billing|support|it\s+department)\b',
        r'\b(company|our|employee|corporate).{0,10}(policy|procedure|process).{0,10}(vacation|leave|expense|travel|remote|wfh)\b',
        r'\b(who\s+(is|are)\s.{0,10}(my|our|the)\s+(manager|hr\s+rep|it\s+admin))\b',
        r'\b(how\s+do\s+i\s+(apply|request)\s.{0,10}(leave|time\s+off|vacation|reimbursement))\b',
    ]):
        return True, "org"

    # Safe — nothing matched
    return False, ""


def _match_any(text: str, patterns: list[str]) -> bool:
    """Returns True if any compiled regex pattern matches text."""
    for p in patterns:
        if re.search(p, text):
            return True
    return False
