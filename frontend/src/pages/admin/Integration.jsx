import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import { Mail, Globe, KeyRound, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import { toast } from "sonner";

export default function Integration() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/settings/integration").then((r) => setS(r.data)); }, []);
  if (!s) return <div className="p-8 overline">Loading…</div>;

  const copy = (text) => { navigator.clipboard.writeText(text); toast.success("Copied"); };

  return (
    <div className="p-8 max-w-[900px] mx-auto" data-testid="integration-page">
      <p className="overline">Integration</p>
      <h1 className="font-display text-4xl tracking-tighter mt-1 mb-2">External Connections</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">Configure email and the public catalog API for your company website.</p>

      <Section title="Email (Resend)" icon={Mail} ok={s.resend_configured}>
        <Row label="Status">
          {s.resend_configured ? <Pill ok>Configured</Pill> : <Pill>Not configured</Pill>}
        </Row>
        <Row label="Sender"><span className="font-mono text-sm">{s.sender_email}</span></Row>
        <Row label="Admin alert email"><span className="font-mono text-sm">{s.admin_alert_email || "— not set —"}</span></Row>
        {!s.resend_configured && (
          <Hint>
            Get an API key at <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="underline">resend.com/api-keys</a>, then set <code className="bg-black/5 px-1 rounded">RESEND_API_KEY</code>, <code className="bg-black/5 px-1 rounded">SENDER_EMAIL</code>, and <code className="bg-black/5 px-1 rounded">ADMIN_ALERT_EMAIL</code> in <code className="bg-black/5 px-1 rounded">/app/backend/.env</code> and restart the backend.
          </Hint>
        )}
      </Section>

      <Section title="Public catalog API" icon={Globe} ok={s.public_api_key_set}>
        <Row label="Status">
          {s.public_api_key_set ? <Pill ok>Active</Pill> : <Pill>Disabled</Pill>}
        </Row>
        {s.public_api_key && (
          <Row label="API Key">
            <div className="flex items-center gap-2">
              <code className="font-mono text-xs bg-black/5 px-2 py-1 rounded break-all">{s.public_api_key}</code>
              <button onClick={() => copy(s.public_api_key)} className="text-[var(--text-muted)] hover:text-[var(--primary)]" data-testid="copy-api-key">
                <Copy size={14}/>
              </button>
            </div>
          </Row>
        )}
        <Row label="Endpoints">
          <ul className="text-xs font-mono space-y-1">
            {s.public_endpoints.map((e) => <li key={e}>GET {e}</li>)}
          </ul>
        </Row>
        <Row label="Auth">
          <div className="text-xs">Send <code className="bg-black/5 px-1 rounded">X-API-Key: &lt;key&gt;</code> header (or <code className="bg-black/5 px-1 rounded">?api_key=…</code>)</div>
        </Row>
        {!s.public_api_key_set && (
          <Hint>
            Set <code className="bg-black/5 px-1 rounded">PUBLIC_API_KEY</code> in <code className="bg-black/5 px-1 rounded">/app/backend/.env</code> to a long random string and restart. Share that key with whoever builds your company website. Tip: use <code className="bg-black/5 px-1 rounded">openssl rand -base64 32</code>.
          </Hint>
        )}
      </Section>

      <Section title="App URL" icon={KeyRound}>
        <Row label="Public URL"><span className="font-mono text-sm">{s.app_url || "— not set —"}</span></Row>
        <Hint>Used in email links. Set <code className="bg-black/5 px-1 rounded">APP_URL</code> in backend .env if it changes.</Hint>
      </Section>
    </div>
  );
}

const Section = ({ title, icon: Icon, ok, children }) => (
  <div className="surface-card p-6 mb-4">
    <div className="flex items-center gap-2 mb-4">
      <Icon size={16} className="text-[var(--primary)]"/>
      <h2 className="font-display text-xl tracking-tight">{title}</h2>
      {ok === true && <CheckCircle2 size={16} className="text-[var(--success)] ml-auto"/>}
      {ok === false && <AlertCircle size={16} className="text-[var(--warning)] ml-auto"/>}
    </div>
    <div className="space-y-3">{children}</div>
  </div>
);

const Row = ({ label, children }) => (
  <div className="grid grid-cols-3 gap-4 items-start py-1.5 border-b border-[var(--border)] last:border-0">
    <div className="overline col-span-1">{label}</div>
    <div className="col-span-2">{children}</div>
  </div>
);

const Pill = ({ ok, children }) => (
  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${ok ? "bg-[var(--success)]/10 text-[var(--success)]" : "bg-black/5 text-[var(--text-muted)]"}`}>{children}</span>
);

const Hint = ({ children }) => (
  <p className="text-xs text-[var(--text-muted)] leading-relaxed bg-black/[0.02] p-3 rounded mt-3">{children}</p>
);
