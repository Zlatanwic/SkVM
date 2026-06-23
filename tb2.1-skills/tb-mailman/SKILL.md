---
name: tb-mailman
description: Configure a Postfix + Mailman3 mailing list server for a reading group (reading-group@local.edu) with join/leave/announce workflows. Use this skill whenever the task mentions Mailman3, Postfix, mailing list server configuration, reading-group@local.edu, mailman.cfg, SubscriptionPolicy.open, or delivering /app/eval.py verifier-passing results. Also trigger when the user references the mailman task, Docker image alexgshaw/mailman:20251031, or needs to configure Unix mail delivery to /var/mail/<username>.
---

# tb-mailman

Set up a functional mailing list server by configuring Postfix and Mailman3 to
support subscribe-by-mail, unsubscribe-by-mail, and announcement posting for a
reading group at `reading-group@local.edu`. This is a Terminal-Bench 2.1 medium
system-administration task; the full task lives at `tasks/mailman/` in the same
repo as this skill.

## When this skill triggers

Use it when the user is dropped into the `mailman` Docker container and needs
to deliver a working `/etc/mailman3/mailman.cfg` configuration that makes the
three mail workflows pass the `/app/eval.py` verifier. Do **not** use it for
general Postfix setup, generic SMTP configuration, or non-Mailman mailing list
tools (e.g., Sympa, Listserv, GNU Mailman 2.x).

## Goal (one sentence)

Configure Postfix and Mailman3 so that mailing to `reading-group-join@local.edu`
adds a subscriber, `reading-group-leave@local.edu` removes a subscriber, and
`reading-group@local.edu` distributes announcements to all subscribers, with
mail delivered to local Unix `mbox` files under `/var/mail/<username>`.

## Required outputs

| File | Purpose |
|---|---|
| `/etc/mailman3/mailman.cfg` | Mailman3 configuration file. Must define the reading-group list with correct domain, subscription policy, and MTA integration settings. |
| Functional mail workflows | Not a file, but the verifier checks: (1) join via `reading-group-join@local.edu`, (2) leave via `reading-group-leave@local.edu`, (3) announce via `reading-group@local.edu`. |

The verifier (`/app/eval.py`) sends test emails and checks the mbox files under
`/var/mail/<username>` for expected contents. Skipping any workflow turns the
run red.

## Recommended workflow

### 1. Survey the installed pieces (≈ 2 min)

- Confirm both `postfix` and `mailman3` (Mailman 3 / mailman3-full) are
  installed: `dpkg -l | grep -E "postfix|mailman"` or `which mailman`.
- Find Mailman3's config search path — typically `/etc/mailman3/mailman.cfg`.
- Read `/app/eval.py` to understand exactly what the verifier does: which
  email addresses it mails, how it checks mbox files, what format it expects.

### 2. Understand the core concepts (≈ 3 min)

Mailman3 + Postfix integration requires aligning several pieces:

1. **Mailman3 core** — manages lists, subscriptions, and archiving.
2. **Postfix** — the MTA that receives mail and hands it to Mailman3.
3. **LMTP delivery** — Postfix typically forwards list-bound mail to Mailman3
   via LMTP on `localhost:8024` (default).
4. **List configuration** — each list is created with `mailman create`, then
   tuned via the REST API or `mailman shell`.
5. **Subscription policy** — set to `open` per task spec: users can
   self-subscribe but must confirm by replying to the confirmation email.

### 3. Configure Postfix (≈ 10 min)

The task spec says mail for `<user>@local.edu` goes to `/var/mail/<username>`
(mbox format). Key Postfix settings:

```
# In /etc/postfix/main.cf or via postconf
myhostname = local.edu
mydomain = local.edu
mydestination = local.edu, localhost
home_mailbox = Maildir/   # or configure for mbox delivery
mailbox_command =         # ensure mbox delivery path
```

Postfix must route list-bound mail to Mailman3. The typical pattern:
- Configure transport maps so that `reading-group@local.edu`,
  `reading-group-join@local.edu`, `reading-group-leave@local.edu` are handed
  to the Mailman3 LMTP service.
- Or use aliases (`/etc/aliases`) that pipe to Mailman3's inject commands.

### 4. Configure Mailman3 (≈ 15 min)

Write `/etc/mailman3/mailman.cfg` covering at minimum:

```ini
[mailman]
site_owner: admin@local.edu

[webservice]
# Even if not using the web UI, the core needs this section.

[database]
# Database backend — SQLite is fine for this task.

[archiver.hyperkitty]
# May not be needed but ensure it doesn't break startup.

[mta]
incoming: mailman.mta.postfix.LMTP
outgoing: /usr/sbin/sendmail   # or appropriate path
lmtp_host: 0.0.0.0
lmtp_port: 8024
```

Create the list:

```bash
mailman create reading-group@local.edu
mailman inject --list reading-group@local.edu ...
```

Then set the subscription policy to `open` via REST API or `mailman shell`:

```python
# mailman shell example
from mailman.interfaces.subscriptions import SubscriptionPolicy
list_ = getUtility(IListManager).get('reading-group@local.edu')
list_.subscription_policy = SubscriptionPolicy.open
```

### 5. Wire Postfix to Mailman3 (≈ 10 min)

The standard approach is LMTP:

1. Ensure Mailman3's LMTP runner is running on port 8024.
2. Configure Postfix's `master.cf` to define an LMTP transport.
3. Set up `transport_maps` or `virtual_alias_maps` so that list addresses
   (`reading-group`, `reading-group-join`, `reading-group-leave`) route to
   Mailman3's LMTP.
4. Restart/reload both services.

### 6. Test and iterate with eval.py (≈ 10 min)

```bash
python3 /app/eval.py
```

If a test fails, read the traceback — the verifier tells you whether the
join, leave, or announce step broke. Check:
- Mailman3 logs under `/var/log/mailman3/` or journal.
- Postfix logs under `/var/log/mail.log`.
- Mbox files under `/var/mail/` to see if mail arrived.

## Verifier checklist (must all pass)

- [ ] Mailman3 is running and reachable.
- [ ] Postfix is running and accepting mail.
- [ ] `reading-group-join@local.edu` — mailing triggers subscription (after
      user confirms by reply).
- [ ] `reading-group-leave@local.edu` — mailing triggers unsubscription (after
      user confirms by reply).
- [ ] `reading-group@local.edu` — announcement reaches all subscribers.
- [ ] Subscriber mails appear at `/var/mail/<username>`.
- [ ] `/etc/mailman3/mailman.cfg` exists and is valid.

## Common pitfalls

1. **Forgetting Postfix-MTA integration.** Mailman3 alone does not handle SMTP
   receiving. Without Postfix transport/alias rules pointing list addresses
   to Mailman3's LMTP, mail never reaches the list processor. The verifier
   will silently fail because no mbox delivery occurs.
2. **Confirmation loop.** The task requires `SubscriptionPolicy.open` but users
   still need to confirm by replying. If the confirmation reply doesn't reach
   Mailman3 (Postfix routing broken or confirmation bot not configured), the
   user is never actually subscribed. Test the full round-trip manually.
3. **Wrong mailbox format.** The task expects mbox files at
   `/var/mail/<username>`. If Postfix is configured for Maildir, the verifier's
   `mailbox.mbox()` call will fail to find messages. Double-check
   `home_mailbox` or `mail_spool_directory`.
4. **Service not restarted after config change.** Both Postfix and Mailman3
   need a restart or reload after config edits. A common mistake is writing
   `mailman.cfg` but never restarting the Mailman3 service.
5. **List not created or wrong list name.** The verifier sends mail to
   `reading-group@local.edu` specifically. If the list is named differently or
   never created, all three workflows fail.

## Reference pointers

- Mailman3 documentation: https://docs.mailman3.org/
- Postfix LMTP transport: http://www.postfix.org/lmtp.8.html
- The `/app/eval.py` script is the ground truth for what the verifier checks.
- Inside the container, `mailman` and `postconf` CLI tools provide
  configuration introspection.
