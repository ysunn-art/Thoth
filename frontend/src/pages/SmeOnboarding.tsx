import { useState } from "react";
import { UserPlus } from "lucide-react";

interface Sme {
  name: string;
  email: string;
  phone?: string;
  expertise: string[];
}

const INITIAL_SMES: Sme[] = [
  {
    name: "Dr. Sarah Johnson",
    email: "sarah.johnson@t-mobile.com",
    phone: "555-0123",
    expertise: ["Network Security", "5G Infrastructure"],
  },
  {
    name: "Michael Chen",
    email: "michael.chen@t-mobile.com",
    expertise: ["Customer Service Policy", "Billing Systems"],
  },
];

export default function SmeOnboarding() {
  const [smes, setSmes] = useState(INITIAL_SMES);
  const [name, setName] = useState("Dr. Sarah Johnson");
  const [email, setEmail] = useState("sarah.johnson@t-mobile.com");
  const [phone, setPhone] = useState("555-0123");
  const [expertise, setExpertise] = useState(
    "Network Security, 5G Infrastructure, Cloud Computing",
  );

  const canRegister = name.trim() && email.trim() && expertise.trim();

  function register() {
    if (!canRegister) return;
    const next: Sme = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      expertise: expertise
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    };
    setSmes([next, ...smes.filter((sme) => sme.email !== next.email)]);
  }

  return (
    <main className="flex-1 overflow-y-auto bg-white p-8">
      <header>
        <h1 className="text-2xl font-medium text-neutral-900">SME Onboarding</h1>
        <p className="mt-1 text-base text-neutral-500">
          Register as a Subject Matter Expert to share your knowledge with the organization
        </p>
      </header>

      <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(420px,591px)_minmax(420px,631px)]">
        <section className="rounded-lg border border-border bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-magenta-tint text-magenta">
              <UserPlus size={24} />
            </div>
            <h2 className="text-xl font-medium text-neutral-900">Register New SME</h2>
          </div>

          <div className="mt-6 space-y-4">
            <TextField
              label="Full Name *"
              value={name}
              onChange={setName}
              placeholder="Dr. Sarah Johnson"
            />
            <TextField
              label="Email Address *"
              value={email}
              onChange={setEmail}
              placeholder="sarah.johnson@t-mobile.com"
              type="email"
            />
            <TextField
              label="Phone Number"
              value={phone}
              onChange={setPhone}
              placeholder="555-0123"
            />
            <div>
              <TextField
                label="Areas of Expertise *"
                value={expertise}
                onChange={setExpertise}
                placeholder="Network Security, 5G Infrastructure, Cloud Computing"
              />
              <p className="mt-1 text-sm text-neutral-500">
                Separate multiple areas with commas
              </p>
            </div>
            <button
              onClick={register}
              disabled={!canRegister}
              className="h-12 w-full rounded-lg bg-magenta px-4 text-base font-medium text-white transition-colors hover:bg-magenta/90 disabled:cursor-not-allowed disabled:bg-magenta/40"
            >
              Register as SME
            </button>
          </div>
        </section>

        <aside className="space-y-6">
          <section className="rounded-lg border border-border bg-white p-6">
            <h2 className="text-lg font-medium text-neutral-900">
              Current SMEs ({smes.length})
            </h2>
            <div className="mt-4 flex max-h-96 flex-col gap-3 overflow-y-auto pr-1">
              {smes.map((sme) => (
                <SmeCard key={sme.email} sme={sme} />
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-blue-200 bg-blue-50 p-6">
            <h2 className="text-lg font-medium text-blue-900">What happens next?</h2>
            <ol className="mt-3 space-y-2 text-sm text-blue-800">
              <li>1. Complete this registration form with your details</li>
              <li>2. Participate in expert interviews to share your knowledge</li>
              <li>3. Upload supporting materials and documents</li>
              <li>4. Review and approve AI-synthesized knowledge entries</li>
            </ol>
          </section>
        </aside>
      </div>
    </main>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-base font-medium text-neutral-900">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-10 w-full rounded-lg border border-border bg-neutral-50 px-4 text-base text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-magenta focus:bg-white"
      />
    </label>
  );
}

function SmeCard({ sme }: { sme: Sme }) {
  return (
    <div className="rounded-lg border border-border bg-white p-4">
      <h3 className="text-base font-medium text-neutral-900">{sme.name}</h3>
      <p className="mt-1 text-sm text-neutral-500">{sme.email}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {sme.expertise.map((item) => (
          <span
            key={item}
            className="rounded bg-magenta-tint px-2 py-1 text-xs text-magenta"
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}
