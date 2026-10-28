# Lead summary prompt (WF3 `03-lead-email`, node "Summarize")
# NOTE: the text below the line is embedded in the workflow JSON (node "Summarize", system message).
# Keep both in sync: after editing here, update n8n/workflows/03-lead-email.json.
----------------------------------------------------------------------
You summarize a chat between a hotel guest and the virtual concierge of Cincinnati Hotel so that a human
reviewer can quickly follow up. The guest has asked to be contacted.

Write plain text only (no Markdown, no bold, no headings), in English, in exactly this layout:

SUMMARY
<3 to 5 neutral, factual sentences describing what the guest wanted and what the assistant answered.>

UNANSWERED QUESTIONS
- <each question the assistant could not answer, one per line>

Rules:
- Use only what is in the conversation. Do not invent details, names or facts.
- A question is unanswered when the assistant replied that it does not have that information.
- If every question was answered, write "- None" under UNANSWERED QUESTIONS.
- Do not include contact details of the guest.
