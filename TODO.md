# Planned features

## Gmail inbox queue (deferred)

Implement after visit delays and cross-window pinned tabs have landed.

Reduce habitual checking of multiple Gmail accounts by consolidating incoming
Inbox messages into one pinned notification/queue tab. Gmail only initially.

- Track all connected Gmail inboxes. Include messages arriving in Inbox; exclude
  Spam, Trash, and messages that bypass Inbox.
- Cmd+Shift+1 opens the next inbox with unhandled arrivals. Open the email directly
  when that inbox has one pending email; open its inbox when it has several.
- Cmd+Shift+2 marks the current email as handled. Cmd+Shift+1 then advances to the
  next pending item.
- Finish one account's inbox before advancing to the next account.
- Provide one pinned tab showing the consolidated queue and notification counts.

Decisions to resolve before implementation:

- Define "handled": app-local acknowledgement, mark as read, archive, or another
  Gmail action. Do not assume permission to archive or delete mail.
- Choose account connection, arrival detection, initial backlog behavior, and a
  stable user-configurable account order.
- Define the empty-queue behavior and how to identify the current email when the
  user invokes the handled shortcut from Gmail's inbox or another tab.
- Check Cmd+Shift+1 / Cmd+Shift+2 availability on macOS and provide configurable
  shortcuts if Chrome or the OS reserves them.
