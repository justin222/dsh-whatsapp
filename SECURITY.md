# Security

WhatsApp Desk can read and send messages from your WhatsApp account and stores linked-device credentials on disk. Treat the `.data/` folder as a password.

## Reporting a vulnerability

Please use this repository's **GitHub Security Advisories** page ("Report a vulnerability") rather than opening a public issue. Include:

- what the issue allows an attacker to do,
- steps to reproduce,
- the affected version and browser/OS.

Do not attach `.data/`, `store.json`, `creds.json`, QR screenshots, message exports, or logs that contain message content. Redact phone numbers and message text.

## Running safely

- Keep the server on `127.0.0.1`; do not expose it to a LAN or the internet.
- Do not commit or share `.data/`. It contains the linked-device session.
- The dashboard is not a multi-user service. Anyone with access to this Windows account and folder can read the local cache.
- Auto-reply is off by default. If you enable it, the app can send messages on your behalf to direct contacts.
- This is an unofficial WhatsApp client. It is not affiliated with WhatsApp or Meta. Review the risks in the main [README](README.md).
