"""Rebuild fictional reports and separately held evaluation labels. No model outputs here."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CASES = [
    (
        "barasat-flood",
        "Barasat",
        22.7229,
        88.4806,
        "flood",
        [
            "বন্যায় বারাসাতে 2 জন আটকে আছেন। জল বাড়ছে। উদ্ধার দরকার।",
            "Flooding near Barasat station. 2 people trapped. Water rising. Rescue requested.",
            "बारासात में बाढ़ है। 2 लोग फंसे हैं। बचाव की जरूरत है।",
        ],
    ),
    (
        "madhyamgram-fire",
        "Madhyamgram",
        22.6939,
        88.4653,
        "fire",
        [
            "Fire reported at an empty workshop in Madhyamgram. Fire service requested.",
            "মধ্যমগ্রামে একটি খালি কারখানায় আগুন লেগেছে। দমকল দরকার।",
            "मध्यमग्राम की खाली कार्यशाला में आग लगी है। दमकल चाहिए।",
        ],
    ),
    (
        "barrackpore-medical",
        "Barrackpore",
        22.7674,
        88.3883,
        "medical",
        [
            "Medical assistance requested at a shelter in Barrackpore. 3 people need an ambulance.",
            "ব্যারাকপুরের আশ্রয়কেন্দ্রে 3 জনের চিকিৎসা দরকার। অ্যাম্বুলেন্স চাই।",
            "बैरकपुर आश्रय में 3 लोग हैं। चिकित्सा सहायता और एम्बुलेंस चाहिए।",
        ],
    ),
    (
        "dum-dum-road",
        "Dum Dum",
        22.6476,
        88.4316,
        "infrastructure",
        [
            "A road in Dum Dum is blocked by a fallen tree. Request a clearance team.",
            "দমদমের রাস্তায় গাছ পড়ে পথ বন্ধ। রাস্তা পরিষ্কার করা দরকার।",
            "दमदम की सड़क पर पेड़ गिरा है। रास्ता खोलने की जरूरत है।",
        ],
    ),
    (
        "habra-flood",
        "Habra",
        22.8489,
        88.6636,
        "flood",
        [
            "Floodwater has entered a Habra lane. 4 people trapped. Rescue needed.",
            "হাবড়ায় বন্যার জল ঢুকেছে। 4 জন আটকে আছেন। উদ্ধার চাই।",
            "हाबरा में बाढ़ का पानी भर गया है। 4 लोग फंसे हैं। बचाव चाहिए।",
        ],
    ),
    (
        "new-town-fire",
        "New Town",
        22.5797,
        88.4710,
        "fire",
        [
            "Fire in a fictional New Town storage shed. Nobody trapped. Fire service requested.",
            "নিউ টাউনের গুদামে আগুন। কেউ আটকে নেই। দমকল চাই।",
            "न्यू टाउन के गोदाम में आग है। कोई फंसे नहीं हैं। दमकल चाहिए।",
        ],
    ),
    (
        "bongaon-bridge",
        "Bongaon",
        23.0440,
        88.8290,
        "infrastructure",
        [
            "Bridge damage reported near Bongaon. A crack is visible. Inspection requested.",
            "বনগাঁর সেতুতে ফাটল দেখা গেছে। পরীক্ষা করা দরকার।",
            "बनगांव के पुल में दरार दिखी है। निरीक्षण चाहिए।",
        ],
    ),
    (
        "howrah-medical",
        "Howrah",
        22.5958,
        88.2636,
        "medical",
        [
            "Medical help requested at a fictional Howrah shelter. 1 person needs an ambulance.",
            "হাওড়ার আশ্রয়কেন্দ্রে 1 জনের চিকিৎসা দরকার। অ্যাম্বুলেন্স চাই।",
            "हावड़ा आश्रय में 1 व्यक्ति को चिकित्सा मदद चाहिए। एम्बुलेंस चाहिए।",
        ],
    ),
    (
        "basirhat-flood",
        "Basirhat",
        22.6574,
        88.8672,
        "flood",
        [
            "Flooding in a Basirhat lane. Water rising. Shelter requested; affected count unknown.",
            "বসিরহাটে বন্যা। জল বাড়ছে। আশ্রয় দরকার। কতজন আছেন জানা নেই।",
            "बशीरहाट में बाढ़ है। पानी बढ़ रहा है। आश्रय चाहिए। संख्या अज्ञात है।",
        ],
    ),
    (
        "kalyani-power",
        "Kalyani",
        22.9751,
        88.4345,
        "infrastructure",
        [
            "A damaged power line near Kalyani is hanging over the road. Utility crew requested.",
            "কল্যাণীতে বিদ্যুতের তার রাস্তার উপরে ঝুলছে। বিদ্যুৎ কর্মী দরকার।",
            "कल्याणी में बिजली का तार सड़क पर लटक रहा है। मरम्मत चाहिए।",
        ],
    ),
]


def generate():
    (ROOT / "data").mkdir(exist_ok=True)
    reports, labels = [], {}
    for index, (group, place, lat, lon, category, texts) in enumerate(CASES):
        for variant, text in enumerate(texts):
            key = f"demo-{index:02}-{variant}"
            reports.append(
                {
                    "source_id": key,
                    "text": text,
                    "language": "auto",
                    "location_text": place,
                    "latitude": lat + variant * 0.0003,
                    "longitude": lon + variant * 0.0002,
                    "occurred_at": f"2026-10-08T{8 + index:02}:{variant * 3:02}:00+05:30",
                    "synthetic": True,
                }
            )
            labels[key] = {"group": group, "incident_type": category}
    (ROOT / "data" / "reports.json").write_text(
        json.dumps(reports, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (ROOT / "data" / "expected_labels.json").write_text(json.dumps(labels, indent=2), encoding="utf-8")
    print(f"Generated {len(reports)} synthetic reports in {len(CASES)} labeled groups.")


if __name__ == "__main__":
    generate()
