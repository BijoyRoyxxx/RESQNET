import {
  Flame,
  HeartPulse,
  Phone,
  ShieldCheck,
  LifeBuoy,
  TrainFront,
  Users,
} from "lucide-react";

const national = "https://www.india.gov.in/directory/helpline";
const ambulance =
  "https://nhm.gov.in/nhm_live/index1.php?lang=1&level=2&lid=189&sublinkid=1217";
const groups = [
  {
    name: "Fire & gas safety",
    tone: "fire",
    icon: Flame,
    lines: [
      {
        name: "Fire brigade",
        number: "101",
        note: "Fire and rescue emergencies",
        source: "https://112.gov.in/about",
      },
      {
        name: "LPG gas leak",
        number: "1906",
        note: "LPG emergency helpline",
        source: "https://www.iocl.com/help",
      },
    ],
  },
  {
    name: "Medical & health",
    tone: "medical",
    icon: HeartPulse,
    lines: [
      {
        name: "Emergency ambulance",
        number: "108",
        note: "Availability varies by state; use 112 if unavailable",
        source: ambulance,
      },
      {
        name: "Patient transport",
        number: "102",
        note: "Primarily maternal and child transport; state coverage varies",
        source: ambulance,
      },
      {
        name: "Tele-MANAS",
        number: "14416",
        note: "24-hour mental health support",
        source:
          "https://dghs.mohfw.gov.in/national-mental-health-programme.php",
      },
    ],
  },
  {
    name: "Police & cybercrime",
    tone: "police",
    icon: ShieldCheck,
    lines: [
      {
        name: "Police",
        number: "100",
        note: "Police assistance; 112 is the unified alternative",
        source: "https://112.gov.in/faq",
      },
      {
        name: "Cyber financial fraud",
        number: "1930",
        note: "Report online financial fraud promptly",
        source: "https://www.cybercrime.gov.in/Hindi/Helplinehn.aspx",
      },
    ],
  },
  {
    name: "Women, children & elders",
    tone: "support",
    icon: Users,
    lines: [
      {
        name: "Women helpline",
        number: "181",
        note: "Support for women in distress; local coverage varies",
        source: national,
      },
      {
        name: "Women police helpline",
        number: "1091",
        note: "Local police support where available; use 112 for emergencies",
        source:
          "https://ncdc.mohfw.gov.in/wp-content/uploads/2024/07/DM-Plan_compressed.pdf",
      },
      {
        name: "Child helpline",
        number: "1098",
        note: "Children needing care and protection",
        source: national,
      },
      {
        name: "Elderline",
        number: "14567",
        note: "Senior citizen assistance; operating hours vary",
        source: "https://shopian.nic.in/",
      },
    ],
  },
  {
    name: "Road & rail",
    tone: "travel",
    icon: TrainFront,
    lines: [
      {
        name: "National highways",
        number: "1033",
        note: "Highway incidents and roadside assistance",
        source:
          "https://nhai.gov.in/nhai/Doc/31jan17/Consultancy%20Services%20for%20Incident%20Management.pdf",
      },
      {
        name: "Rail Madad",
        number: "139",
        note: "Railway security and medical assistance",
        source:
          "https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=1703201&lang=2&reg=3",
      },
    ],
  },
  {
    name: "Disaster & rescue",
    tone: "rescue",
    icon: LifeBuoy,
    lines: [
      {
        name: "NDRF helpline",
        number: "+91 97110 77372",
        note: "National Disaster Response Force",
        source: "https://www.ndrf.gov.in/en",
      },
      {
        name: "NDMA control room",
        number: "011 2670 1728",
        note: "National disaster coordination; helpline also listed as 1078",
        source: "https://ndmindia.mha.gov.in/ndmi/contact-us",
      },
      {
        name: "State disaster control",
        number: "1070",
        note: "State emergency operations; availability varies",
        source:
          "https://msdma.gov.in/docs/StandardOperatingProcedure_StateEmergencyOperationCentre.pdf",
      },
      {
        name: "District disaster control",
        number: "1077",
        note: "District emergency operations; availability varies",
        source:
          "https://msdma.gov.in/docs/StandardOperatingProcedure_StateEmergencyOperationCentre.pdf",
      },
    ],
  },
];

export function EmergencyDirectory({ admin = false }: { admin?: boolean }) {
  return (
    <footer
      className={`emergency-directory ${admin ? "admin-directory" : ""}`}
      id="emergency-numbers"
      aria-label="India emergency helplines"
    >
      <div className="directory-inner">
        <div className="directory-heading">
          <div>
            <span className="eyebrow">INDIA / QUICK CONTACTS</span>
            <h2>
              The right number.
              <br />
              <em>When it matters.</em>
            </h2>
          </div>
          <div className="national-emergency">
            <span>IMMEDIATE DANGER / ANY EMERGENCY</span>
            <div>
              <strong>112</strong>
              <a
                href="tel:112"
                className="call-button"
                aria-label="Call national emergency 112"
              >
                <Phone size={17} />
                Call 112
              </a>
            </div>
            <p>
              Police, fire and medical emergencies across India.{" "}
              <a href="https://112.gov.in/" target="_blank" rel="noreferrer">
                Official ERSS ↗
              </a>
            </p>
          </div>
        </div>
        <p className="directory-intro">
          National and commonly used service helplines. State and local numbers
          vary. Call buttons open your phone or calling app; no call is placed
          automatically.
        </p>
        <div className="directory-grid">
          {groups.map((group) => (
            <section
              key={group.name}
              className={`helpline-group route-${group.tone}`}
            >
              <h3>
                <group.icon size={19} />
                {group.name}
              </h3>
              {group.lines.map((line) => (
                <div className="helpline-row" key={line.number}>
                  <div>
                    <strong>{line.name}</strong>
                    <span>{line.number}</span>
                    <p>{line.note}</p>
                    <a
                      className="helpline-source"
                      href={line.source}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Official source ↗
                    </a>
                  </div>
                  <a
                    className="call-button"
                    href={`tel:${line.number.replace(/[^+\d]/g, "")}`}
                    aria-label={`Call ${line.name} ${line.number}`}
                  >
                    <Phone size={14} />
                    Call
                  </a>
                </div>
              ))}
            </section>
          ))}
        </div>
        <div className="directory-bottom">
          <span>
            Sources checked 9 October 2026. Service availability is not
            confirmed by this app.
          </span>
          <a href={national} target="_blank" rel="noreferrer">
            Government helpline directory ↗
          </a>
        </div>
      </div>
    </footer>
  );
}
