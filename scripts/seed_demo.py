#!/usr/bin/env python3
"""Seed a realistic T-Mobile demo knowledge base into the running backend.

Loads 5 SMEs (~22 entries) through the real ingestion pipeline:
    POST /smes  ->  POST /smes/{id}/materials  ->  .../knowledge/synthesize
    ->  /knowledge/{id}/approve  ->  /knowledge/{id}/admin-approve (embeds)

Usage (backend must be up on :8000):
    python scripts/seed_demo.py --purge        # wipe existing data, then load T-Mobile demo
    python scripts/seed_demo.py                # append without purging
    python scripts/seed_demo.py --dump-csv     # just write demo/tmobile_knowledge_base.csv

Reads BENCHMARK_API_KEY (and optional BASE_URL) from the repo-root .env.
Figures are illustrative mock values for demo purposes.
"""
import argparse
import csv
import io
import os
import sys
import time
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "demo" / "tmobile_knowledge_base.csv"

# --------------------------------------------------------------------------- #
# SME directory
# --------------------------------------------------------------------------- #
SMES = {
    "Priya Raman": {
        "specialization": "Network Engineering",
        "sub_areas": ["5G coverage", "LTE", "VoLTE", "Wi-Fi Calling", "roaming", "network outages"],
    },
    "Marcus Bell": {
        "specialization": "Plans & Devices",
        "sub_areas": ["rate plans", "device financing", "trade-in", "eSIM", "BYOD", "hotspot", "promotions"],
    },
    "Sofia Alvarez": {
        "specialization": "Customer Care & Billing",
        "sub_areas": ["billing", "AutoPay", "fees and taxes", "payment arrangements", "refunds"],
    },
    "Derek Coleman": {
        "specialization": "Account Security & Fraud",
        "sub_areas": ["account takeover protection", "port-out PIN", "SIM swap", "Scam Shield", "account PIN"],
    },
    "Aisha Mohammed": {
        "specialization": "T-Mobile for Business",
        "sub_areas": ["business unlimited", "5G Home Internet", "fixed wireless", "IoT", "business support"],
    },
}

# --------------------------------------------------------------------------- #
# Knowledge entries (source material — synthesis re-structures these)
# --------------------------------------------------------------------------- #
DATA = [
    # ---- Priya Raman — Network Engineering ----
    ("net-01", "5G Network Bands and Coverage Tiers", "Priya Raman",
     "T-Mobile operates two 5G tiers. Ultra Capacity 5G uses mid-band spectrum, primarily band n41 "
     "(2.5 GHz) plus n25 and n66, delivering the fastest speeds, typically 200-300 Mbps. Extended "
     "Range 5G uses band n71 (600 MHz) for broad coverage that reaches indoors and rural areas. "
     "Ultra Capacity 5G covers over 300 million people; Extended Range 5G covers over 330 million. "
     "A 5G-capable device and a T-Mobile SIM or eSIM are required to access 5G."),
    ("net-02", "VoLTE and Wi-Fi Calling Setup", "Priya Raman",
     "VoLTE (Voice over LTE) is enabled by default on modern devices and is required for calling "
     "after the 3G/2G network shutdown. Wi-Fi Calling can be enabled under Settings > Network and "
     "requires a registered E911 address for emergency calls. Wi-Fi Calling works over any Wi-Fi "
     "network and is useful where cellular signal is weak. Most devices support seamless hand-off "
     "between Wi-Fi Calling and VoLTE."),
    ("net-03", "Network Outage Troubleshooting", "Priya Raman",
     "Standard troubleshooting steps for no-service or slow-data reports: Step 1, toggle Airplane "
     "mode for 10 seconds. Step 2, restart the device. Step 3, check for known outages on the "
     "T-Mobile status page or the T-Life app. Step 4, reset network settings under Settings > "
     "General > Reset. If the issue persists, escalate to Network Engineering with the customer's "
     "location and device IMEI."),
    ("net-04", "International Roaming - Simple Global", "Priya Raman",
     "Simple Global is included on Go5G and Magenta plans: unlimited texting and 5 GB of high-speed "
     "data in 215+ countries, then unlimited data at reduced speed. Voice roaming is $0.25 per "
     "minute in included countries. For more high-speed data, the International Pass options are a "
     "1-day pass for $5 (512 MB) or a 10-day pass for $35 (5 GB). Roaming should be activated in "
     "account settings before travel."),
    ("net-05", "Signal Boosters and Home Coverage", "Priya Raman",
     "For homes with weak signal, T-Mobile offers the 4G/5G CellSpot signal booster to qualifying "
     "customers; it requires a broadband internet connection. Wi-Fi Calling is the recommended free "
     "alternative for weak indoor signal. Coverage at a specific address can be verified on the "
     "T-Mobile coverage map before recommending a booster."),

    # ---- Marcus Bell — Plans & Devices ----
    ("plan-01", "Consumer Rate Plans Overview", "Marcus Bell",
     "Current consumer plans (single-line pricing with AutoPay): Go5G Plus is $90/mo and includes "
     "unlimited premium data, 50 GB of mobile hotspot, and Netflix Standard. Go5G is $75/mo with "
     "15 GB hotspot. Magenta MAX is $85/mo with unlimited premium data and 40 GB hotspot. Essentials "
     "is $60/mo with unlimited data and no premium streaming. Multi-line discounts apply and AutoPay "
     "is required for advertised pricing."),
    ("plan-02", "Device Financing (EIP) and Trade-In", "Marcus Bell",
     "The Equipment Installment Plan (EIP) offers 24-month 0% APR financing with $0 down for "
     "qualified credit. Trade-in credits are applied as monthly bill credits spread over 24 months. "
     "An eligible flagship trade-in can earn up to $830 in credits with a qualifying plan. A device "
     "must be paid off or traded in to upgrade early."),
    ("plan-03", "eSIM and BYOD Activation", "Marcus Bell",
     "eSIM activation is done via QR code or the T-Life app, with no physical SIM required. For "
     "Bring Your Own Device (BYOD), check IMEI compatibility at t-mobile.com/byod. The device must "
     "be unlocked and support T-Mobile bands such as n41 and n71. To activate, scan or insert the "
     "SIM and dial #686# to confirm the phone number."),
    ("plan-04", "Mobile Hotspot and Data Allotments", "Marcus Bell",
     "Mobile hotspot allotments by plan: Go5G Plus 50 GB, Magenta MAX 40 GB, Go5G 15 GB. After the "
     "monthly high-speed hotspot data is used, hotspot speeds reduce to 600 Kbps for the rest of the "
     "cycle. Hotspot data is tracked separately from on-device unlimited data."),
    ("plan-05", "Discounts and Promotions", "Marcus Bell",
     "T-Mobile offers reduced per-line pricing for Military, Veterans, First Responders, and 55+ "
     "customers. The 55+ plan offers 2 lines for $70/mo with AutoPay on Essentials Choice. The "
     "AutoPay discount is $5 per line for up to 8 lines with an eligible debit card or bank account. "
     "Promotions require a qualifying plan and may require a new line activation."),

    # ---- Sofia Alvarez — Customer Care & Billing ----
    ("bill-01", "Billing Cycle and AutoPay", "Sofia Alvarez",
     "Bills are issued monthly and the bill cycle date is set at activation. Payment is due 20 days "
     "after the bill is issued. The AutoPay discount is $5 per line when linked to a debit card or "
     "bank account; credit cards are not eligible for the discount. AutoPay drafts payment 2 days "
     "before the due date."),
    ("bill-02", "Taxes, Fees, and Late Payment", "Sofia Alvarez",
     "Some plans are advertised with taxes and fees included (Go5G family), while others are plus "
     "taxes and fees (Essentials). A Regulatory Programs & Telco Recovery Fee may apply per line. "
     "The late fee is $7 or 5% of the past-due amount, whichever is greater. If service is suspended "
     "for non-payment, a restoral fee of $20 per line applies when service is restored."),
    ("bill-03", "Payment Arrangements and Refunds", "Sofia Alvarez",
     "Eligible accounts can set a payment arrangement to split a past-due balance for up to 30 days. "
     "Overpayment refunds are credited to the account or original payment method within 1-2 billing "
     "cycles. When service is cancelled, charges are prorated to the day on most current plans."),
    ("bill-04", "Understanding Your First Bill", "Sofia Alvarez",
     "The first bill is typically higher because it includes a prorated partial month plus the "
     "upcoming full month of service. One-time charges such as activation or a device down payment "
     "also appear on the first bill. Promotional and trade-in bill credits usually begin on the "
     "second or third bill cycle, not the first."),

    # ---- Derek Coleman — Account Security & Fraud ----
    ("sec-01", "Account Takeover Protection and Port-Out PIN", "Derek Coleman",
     "Account Takeover Protection blocks unauthorized transfers (ports) of your number to another "
     "carrier. Customers should set a Port-Out PIN of 6 to 15 digits in account security settings "
     "or by calling 611. The PIN is required to port a number out; port requests without the correct "
     "PIN are rejected. This protection is recommended for every account to prevent number theft."),
    ("sec-02", "SIM Swap and Lost or Stolen Device Response", "Derek Coleman",
     "If a device is lost or stolen, suspend service immediately through the app or by calling 611, "
     "and request an IMEI block to stop the device from being used on any network. SIM-swap fraud "
     "warning sign: sudden, unexpected loss of signal may mean the SIM was swapped to another device "
     "— contact Security right away. After any suspected compromise, re-issue a new SIM and reset "
     "the account PIN."),
    ("sec-03", "Scam Shield and Caller Protections", "Derek Coleman",
     "Scam Shield is free and includes Scam ID, Scam Block, and Caller ID. Enable Scam Block by "
     "dialing #662# and disable it with #632#. Scam Shield Premium is $4/mo and adds Always-On "
     "Caller ID and a second proxy number. Numbers reported as scams are flagged network-wide."),
    ("sec-04", "Account PIN and Identity Verification", "Derek Coleman",
     "A 6-15 digit account PIN or passcode is required to verify identity for in-store and phone "
     "support. Set or reset it in account settings; it is best practice to make it different from "
     "the port-out PIN. Two-Step Verification can be enabled for online account logins. Never share "
     "your PIN — T-Mobile staff will never ask for it by text."),

    # ---- Aisha Mohammed — T-Mobile for Business ----
    ("biz-01", "Business Unlimited Plans", "Aisha Mohammed",
     "T-Mobile for Business offers Business Unlimited Select, Advanced, and Ultimate tiers. "
     "Business Unlimited Ultimate is $50 per line per month for 6 or more lines with AutoPay and "
     "includes 100 GB of hotspot per line. Business Unlimited Advanced is $40 per line at volume "
     "with 100 GB hotspot. Plans include pooled data options and dedicated business support."),
    ("biz-02", "5G Home Internet (Fixed Wireless Access)", "Aisha Mohammed",
     "5G Home Internet is $50/mo with AutoPay, with no annual contract and no equipment fees. It "
     "includes the T-Mobile 5G Gateway, which customers self-install in about 15 minutes. Typical "
     "speeds range from 87 to 415 Mbps depending on signal. A Price Lock guarantee keeps the "
     "monthly rate from increasing."),
    ("biz-03", "IoT and Connected Device Plans", "Aisha Mohammed",
     "IoT data plans support fleets, sensors, and connected devices using pooled data shared across "
     "SIMs. Lines are managed in the Business Account Hub with per-SIM activation and controls. "
     "Low-bandwidth plans start with small monthly data buckets per line for telemetry use cases."),
    ("biz-04", "Business Account Management and Support", "Aisha Mohammed",
     "Business accounts with 5 or more lines receive a dedicated support line and an assigned "
     "account team. Multi-line billing is consolidated into a single business invoice. Administrators "
     "manage lines, plan changes, and user permissions through the Business Account Hub."),
]


# --------------------------------------------------------------------------- #
def _load_env() -> tuple[str, str]:
    key, base = "", "http://localhost:8000/api/v1"
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text().splitlines():
            if line.startswith("BENCHMARK_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
            elif line.startswith("BASE_URL="):
                base = line.split("=", 1)[1].strip().strip('"').strip("'")
    return os.environ.get("BENCHMARK_API_KEY", key), os.environ.get("BASE_URL", base)


def dump_csv() -> None:
    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["entry_id", "topic", "sme_name", "specialization", "content"])
        for eid, topic, sme, content in DATA:
            w.writerow([eid, topic, sme, SMES[sme]["specialization"], content])
    print(f"wrote {CSV_PATH} ({len(DATA)} entries)")


def seed(base_url: str, key: str, do_purge: bool) -> None:
    H = {"Authorization": f"Bearer {key}"}
    JH = {**H, "Content-Type": "application/json"}

    r = requests.get(f"{base_url.replace('/api/v1','')}/health", timeout=5)
    if not r.ok:
        sys.exit("Backend not healthy on the configured URL — start uvicorn on :8000 first.")

    if do_purge:
        requests.post(f"{base_url}/system/purge", headers=H, timeout=30)
        print("purged existing data")

    sme_ids: dict[str, str] = {}
    t0 = time.time()
    for i, (eid, topic, sme, content) in enumerate(DATA, 1):
        if sme not in sme_ids:
            email = sme.lower().replace(" ", ".") + "@t-mobile.com"
            r = requests.post(f"{base_url}/smes", headers=JH, json={
                "name": sme,
                "specialization": SMES[sme]["specialization"],
                "sub_areas": SMES[sme]["sub_areas"],
                "contact_email": email,
            }, timeout=30)
            sme_ids[sme] = r.json()["sme_id"]
            print(f"SME {sme:<16} -> {sme_ids[sme]}")
        sid = sme_ids[sme]

        files = {"file": (f"{eid}.txt", io.BytesIO(content.encode()), "text/plain")}
        r = requests.post(f"{base_url}/smes/{sid}/materials", headers=H,
                          files=files, data={"title": topic, "description": f"Demo source for {eid}"}, timeout=60)
        mat_id = r.json()["material_id"]

        r = requests.post(f"{base_url}/smes/{sid}/knowledge/synthesize", headers=JH,
                          json={"interview_ids": [], "material_ids": [mat_id], "topic": topic}, timeout=120)
        kid = r.json()["entry_id"]
        requests.post(f"{base_url}/knowledge/{kid}/approve", headers=H, timeout=30)
        requests.post(f"{base_url}/knowledge/{kid}/admin-approve", headers=H, timeout=120)
        print(f"  [{i:>2}/{len(DATA)}] {eid:<8} {topic[:42]:<42} -> {kid}")

    print(f"\nSeed complete: {len(DATA)} entries, {len(sme_ids)} SMEs in {time.time()-t0:.0f}s")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--purge", action="store_true", help="wipe all existing data before seeding")
    ap.add_argument("--dump-csv", action="store_true", help="only write the CSV, do not seed")
    args = ap.parse_args()

    dump_csv()  # always refresh the CSV artifact
    if args.dump_csv:
        return
    key, base = _load_env()
    if not key:
        sys.exit("No BENCHMARK_API_KEY found in .env or environment.")
    seed(base, key, args.purge)


if __name__ == "__main__":
    main()
