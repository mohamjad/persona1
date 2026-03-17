# ADR-0004: webext-bridge For Extension Context Messaging

## Status

Accepted.

## Decision

Use `webext-bridge` for typed extension-context messaging between:

- service worker
- popup
- content script

## Why

- Manifest V3 message paths are easy to drift into brittle ad hoc payloads
- the master plan requires typed message protocols instead of hidden implicit message shapes
- bridge handlers make the active hot path easier to trace

## Notes

- a compatibility fallback still exists while the bridge migration is completed
- the target state is no raw `chrome.runtime.sendMessage` in the active path
