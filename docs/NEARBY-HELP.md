# Nearby services, live location and contact alerts

Open **Nearby Help** in the sidebar, or use **Submit Report → Use my live location**. Browser geolocation requires permission and a secure context (HTTPS or localhost). Accuracy and fix time are shown. Stop tracking with the button; leaving the view also clears the watch. Denied or unavailable location leaves manual coordinate entry available. Your current location may differ from where the incident occurred: check before saving.

The service choices appear in this order: **fire → nearest fire brigade**, **medical → nearest hospital**, **general/crime → nearest police station**. Flood reports use rescue services. A saved case category controls automatic routing; without a category, keyword rules check fire, medical and flood signals before defaulting to police. Explicit service selection overrides that suggestion. Fire searches return mapped fire stations; medical searches return mapped hospitals not explicitly marked as having no emergency service. Mixed incidents may require several services. These are routing suggestions, not a dispatch assessment. Cases retain their separate critical/high/medium/low urgency order.

Both portals use a light background with distinct category colors. An India helpline directory on sign-in and user pages contains 18 call links, grouped by service, with official source links and local-availability notes. It covers national and commonly used numbers, not every state or district contact. Call buttons open the device's calling app. No call is placed automatically.

Search submits coordinates and a service filter to the configured OpenStreetMap Overpass provider. Original report text is used only on the local server to choose a service; it is not sent to Overpass. The UI explains this before the search. Searches cover 5, 10, 25 or 50 km and reuse exact-coordinate results for ten minutes. It returns up to twelve nearby mapped facilities, sorted by haversine distance. Coordinates, provider results and lookup time are stored in the local database so subsequent contact decisions are auditable. Continuous GPS updates are not persisted or sent to the map provider automatically.

Distances are **straight-line estimates**, not road distance, travel time or responder arrival time. Directions open an external maps provider with the selected coordinates only after clicking the link. Community map data can miss stations, list administrative police offices, or have outdated contact details. The closest mapped result may not be the responsible jurisdiction. There is no claim that facilities are staffed, operational, reachable or accepting reports. No results and failed lookups are shown explicitly without synthetic fallback facilities.

## From a report to a contact alert

On Submit Report, **Find the nearest suitable service and prepare a contact alert after saving** is checked by default and can be unchecked before submitting. It uses the incident coordinates for the external lookup. After saving, the incident's Nearby Help tab opens, performs the search, selects the nearest mapped result and prepares a message. The original report is saved even when lookup or preparation fails.

An existing incident also has a Nearby Help tab. Select the source report to use its saved coordinates and original wording. Search, choose a facility and prepare an alert. The contact message is persistent and can be copied. `tel:` links open the device's dialer; the application does not place a call or claim a call completed. For immediate danger in India, the UI links to [the official 112 emergency service](https://112.gov.in/).

**A prepared alert has not been sent.** With no authorized station connection, that is the terminal state inside RESQNET. Use a verified contact channel yourself. This build does not have a police/ERSS partnership or connected station.

## Optional authorized integration

Configure only HTTPS endpoints explicitly supplied and authorized by the receiving organization. The map provider's tags, phone numbers and website links can never become alert destinations. This operator-controlled setting maps the exact OSM facility ID to its approved gateway:

```dotenv
RESQ_RESPONDER_WEBHOOKS={"node/123456":"https://authorized-responder.example/alerts"}
RESQ_RESPONDER_TOKEN=provided-gateway-token
```

Those values are illustrative placeholders, not usable credentials or an existing service. Keep real configuration in ignored `.env` and restart the backend. The bearer token and endpoint are never returned to the frontend. Setting an endpoint does not establish an operational partnership or change the app's local-only deployment model.

For a nonsynthetic report, the UI shows the exact contact message and asks for explicit consent to transmit the report text and coordinates. Sending POSTs JSON `{alert_id, facility_id, report_id, message}` to that facility's configured gateway. The gateway must support deduplication using the `Idempotency-Key` header. Redirects are not followed. There are no blind retries, and synthetic reports are rejected before any external delivery attempt.

| State | Meaning |
| --- | --- |
| `prepared_not_sent` | Message saved locally. Nothing transmitted. |
| `sending` | A delivery attempt has been durably claimed. If interrupted, receipt is unconfirmed. |
| `delivered_to_gateway` | Configured gateway returned HTTP 2xx. This is **not** station acknowledgment or confirmation that help is coming. |
| `rejected_by_gateway` | Gateway returned HTTP 4xx. No response is confirmed. |
| `delivery_unknown` | Timeout, network failure, redirect or server error. Transmission may have reached the receiver. Verify through another channel before retrying. |

Each report/facility pair has one alert record. The send claim is committed atomically before network I/O, preventing repeat clicks or concurrent requests from resending the same alert. Records with uncertain delivery cannot be automatically retried. Preparation, attempted delivery and results are added to the audit trail. A human operator must resolve interrupted attempts with the receiver outside this prototype.

## API additions

- `POST /api/services/nearby`: `{latitude, longitude, service: "auto"|"police"|"fire"|"rescue"|"medical", category?, text, radius_km}`.
- `POST /api/reports/{id}/alerts`: `{search_id, facility_id}`; only facilities returned by that search are accepted, and the search must be under 15 minutes old and within 100 m of the report's saved location.
- `GET /api/reports/{id}/alerts`: persistent preparation/delivery history.
- `POST /api/alerts/{id}/send`: `{consent: true}`; requires a nonsynthetic report and configured HTTPS gateway.

New tables are created on backend startup without altering existing reports. External delivery was tested using simulated authorized gateways in automated tests, never by contacting real police or rescue personnel. Live read-only Overpass lookup was tested separately. Browser tests use a simulated geolocation fix; actual hardware accuracy depends on the user's device and permissions.

References: [browser geolocation requirements](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/watchPosition), [Overpass examples](https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_API_by_Example), [official Indian emergency service](https://112.gov.in/).
