# Power Automate email automation setup

The backend sends an HTTP POST event to Power Automate after a record is saved or closed. Email does **not** send until this flow is created, saved, and its trigger URL is configured in the hosting service.

## 1. Create the flow
1. Open Power Automate using the organisation account and choose **Create → Instant cloud flow** (or Automated cloud flow if your tenant offers the HTTP request trigger).
2. Choose the trigger **When an HTTP request is received**. Save once to generate its HTTP POST URL.
3. In **Use sample payload to generate schema**, paste the JSON sample below and save the flow. Copy the generated HTTP POST URL.
4. In the backend host's environment settings, add `PA_WEBHOOK_URL` = that URL. Redeploy/restart the service. Never put this URL in `public/index.html` or a public repository.

## 2. Sample payload/schema
Use this sample to generate the trigger schema (fields may be empty for some events):

```json
{
  "event": "SFI_CREATED",
  "record": {
    "id": "SFI-2026-A1B2C3D4E5",
    "status": "PENDING",
    "submitter": "Example Submitter",
    "submitterEmail": "submitter@example.com",
    "assigneeEmail": "owner@example.com",
    "location": "PUNE",
    "plant": "CGL-1",
    "date": "2026-10-09",
    "shift": "A",
    "category": "PPE Compliance",
    "severity": "High",
    "dept": "CGL1 Mechanical",
    "description": "Observation narrative",
    "requiredAction": "Corrective action required",
    "targetDate": "2026-10-12",
    "actionTaken": "",
    "closureDate": null,
    "initialPhoto": "/uploads/example.jpg",
    "closurePhoto": null
  }
}
```

## 3. Add event condition and email actions
Add a **Switch** control with `event` from the trigger (expression: `triggerBody()?['event']`) or use separate Conditions for these values:

- **SFI_CREATED**: Send an email (V2) to the assignee and submitter. To avoid exposing addresses in CC, make two Send an email (V2) actions, one addressed to `record.assigneeEmail`, one to `record.submitterEmail`. Subject: `Action required: [record.id] — [record.severity]`. Include SFI ID, location, plant, category, observation, required action, target date, and the portal URL.
- **SFI_CLOSED_ON_CREATION**: Send a confirmation email to `record.submitterEmail` and, if present, `record.assigneeEmail`. Subject: `SFI closed: [record.id]`. Include action taken and closure date.
- **SFI_CLOSED**: Send closure confirmation to `record.submitterEmail` and `record.assigneeEmail`. Subject: `SFI closure completed: [record.id]`. Include corrective action and closure date.

In dynamic content, expand `record` and choose the fields. If Power Automate does not expose nested fields, use expressions such as `triggerBody()?['record']?['submitterEmail']`, `triggerBody()?['record']?['id']`, and `triggerBody()?['record']?['description']`.

For a clickable portal link, put the actual deployed portal base URL into the email body and append `?sfiId=` plus the ID. Do not invent a portal URL; use the URL assigned by your host.

## 4. Test it
1. Save and turn the flow on.
2. Submit one test SFI using real permitted email addresses.
3. Confirm the record appears in the register and the Power Automate run history shows success.
4. Close a pending SFI with action remarks and a completion photo, then confirm the closure email.

## Security note
The generated trigger URL is a bearer secret. Keep it private in the host's environment variables. `PA_SHARED_SECRET` is optional and is not a substitute for validating access in a secured gateway/flow. Configure the flow's trigger authentication and organisation-approved access controls where available. The app currently has no user login/role-based authorization; deploy only within an approved access boundary until authentication is added.
