import { useEffect, useRef, useState } from "react";

// The contact form (#contact), over the blurred sheet like the calendar: a
// subject and a message, emailed to the address below, with the sender's own
// address (if they give it) to reply to. The site has no server
// of its own, so the email goes out through FormSubmit (formsubmit.co), which
// forwards whatever is posted to it. The very first message sent sets it up:
// FormSubmit emails the address a link to confirm it wants these, and only
// messages after that are passed on.

const TO = "youarethestream@gmail.com";
const ENDPOINT = `https://formsubmit.co/ajax/${TO}`;

// open: whether the form is showing; onClose: back to the sheet.
export default function ContactPage({ open, onClose }) {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  // "idle", "sending", "sent" or "failed".
  const [status, setStatus] = useState("idle");
  const firstRef = useRef(null);

  const reset = () => {
    setEmail("");
    setSubject("");
    setBody("");
    setStatus("idle");
  };

  // The first field takes the cursor on opening, where there's a pointer (on a
  // phone that would throw the keyboard up over the page straight away).
  useEffect(() => {
    if (!open || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    const t = setTimeout(() => firstRef.current?.focus({ preventScroll: true }), 450);
    return () => clearTimeout(t);
  }, [open]);

  const send = async (e) => {
    e.preventDefault();
    if (status === "sending" || !body.trim()) return;
    setStatus("sending");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          _subject: subject.trim() || "(no subject)",
          _template: "box",
          _captcha: "false",
          // Replying to the email goes to the sender.
          ...(email.trim() && { email: email.trim(), _replyto: email.trim() }),
          subject: subject.trim(),
          message: body.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || String(data.success) === "false") throw new Error(data.message || res.statusText);
      setStatus("sent");
    } catch (err) {
      console.warn("Could not send the message:", err);
      setStatus("failed");
    }
  };

  return (
    <div
      className={`artist-page contact-page loaded${open ? " open" : ""}`}
      aria-hidden={!open}
      onClick={(e) => {
        const c = e.target.classList;
        if (e.target === e.currentTarget || c.contains("ap-scroll") || c.contains("ct-inner")) onClose();
      }}
    >
      <div className="ap-scroll">
        <div className="ap-inner ct-inner">
          {status === "sent" ? (
            <div className="ct-form ct-sent">
              <p>Thank you, your message is on its way.</p>
              <button type="button" className="ap-listen ct-send" onClick={reset} tabIndex={open ? 0 : -1}>
                write another
              </button>
            </div>
          ) : (
            <form className="ct-form" onSubmit={send}>
              <label className="ct-field">
                <span>your email (optional, for a reply)</span>
                <input
                  ref={firstRef}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  maxLength={200}
                  tabIndex={open ? 0 : -1}
                />
              </label>
              <label className="ct-field">
                <span>subject</span>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={200}
                  tabIndex={open ? 0 : -1}
                />
              </label>
              <label className="ct-field">
                <span>message</span>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={9} required tabIndex={open ? 0 : -1} />
              </label>
              <div className="ct-actions">
                <button type="submit" className="ap-listen ct-send" disabled={status === "sending" || !body.trim()} tabIndex={open ? 0 : -1}>
                  {status === "sending" ? "sending…" : "send"}
                </button>
                {status === "failed" && (
                  <p className="ct-error" role="alert">
                    That didn't go through. Try again, or write to <a href={`mailto:${TO}`}>{TO}</a>.
                  </p>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
