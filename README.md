# 🌊 Neer Nexus

### A Coastal Emergency Coordination Ecosystem built with Modiqo Rote

**Neer Nexus** is a three-Play coastal safety ecosystem designed around one simple idea:

> **Detect earlier. Understand faster. Coordinate before danger becomes a crisis.**

The project connects **coastal hazard intelligence**, **maritime distress response**, and **cross-system coordination** into three independent but complementary Rote Plays.

---

## 🌍 Why Neer Nexus?

Natural disasters are rarely a single-system problem.

A hazard may be detected by one system, affect a completely different group of people, and require action from another system.

Recent floods and landslides in **Nepal** have reinforced the importance of early warning, timely information, and coordinated disaster response. The United Nations has documented the severe human and infrastructure impact of Nepal's floods and the importance of anticipatory action and effective warning dissemination.

Neer Nexus takes inspiration from that challenge:

**What if reliable hazard information could move automatically from detection to coordination instead of remaining isolated inside one system?**

That is the problem this project explores.

> **Nepal is the inspiration for the early-warning and coordination principle. The current implementation is focused on coastal safety using authoritative IMD hazard feeds.**

---

# 🧭 The Three-Play Architecture

```text
                         ┌─────────────────────────┐
                         │       KADALKAVAL        │
                         │                         │
                         │ Coastal Hazard          │
                         │ Intelligence            │
                         │                         │
                         │ IMD CAP/RSS ingestion   │
                         │ Hazard detection        │
                         │ Early warning           │
                         └────────────┬────────────┘
                                      │
                               Structured Event
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │       NEER NEXUS        │
                         │                         │
                         │ Coordination Layer      │
                         │                         │
                         │ Event normalization     │
                         │ Coordination decision   │
                         │ Cross-system routing    │
                         └────────────┬────────────┘
                                      │
                              Safety Coordination
                                      │
                                      ▼
                         ┌─────────────────────────┐
                         │   COASTAL FISHER        │
                         │        BEACON           │
                         │                         │
                         │ Maritime Distress       │
                         │ Fisher Safety            │
                         │ Emergency Notification  │
                         └─────────────────────────┘
```

---

# 🌊 1. Kadalkaval

**Kadalkaval** is the coastal hazard intelligence and early-warning Play.

It automatically consumes machine-readable hazard information from the official **IMD CAP/RSS distribution**, identifies relevant coastal threats, extracts structured warning information, and provides a notification path for affected communities.

### It focuses on:

* Coastal hazards
* Flood and severe-weather warnings
* Structured CAP information
* Affected areas
* Severity and urgency
* Early notification

### Public Play

**Kadalkaval 0.2.0**

https://play.modiqo.ai/bavya21/kadalkaval@0.2.0

---

# 🚨 2. Coastal Fisher Beacon

**Coastal Fisher Beacon** is the maritime distress and fisher-safety Play.

It provides an emergency beacon workflow for fishermen and vessels, incorporating available location and telemetry information and delivering structured emergency notifications through Telegram.

### It focuses on:

* Maritime distress
* Fisher and vessel information
* Location awareness
* GPS and telemetry
* Emergency notification
* Safety response

### Public Play

**Coastal Fisher Beacon**

https://play.modiqo.ai/bavya21/coastal-fisher-beacon

---

# 🔗 3. Neer Nexus

**Neer Nexus** is the coordination layer.

It receives structured hazard information, evaluates its coordination meaning, and produces a decision describing how information should flow between the coastal hazard and maritime-safety domains.

For example:

```text
Coastal Hazard
      │
      ▼
Kadalkaval
      │
      │ hazard event
      ▼
Neer Nexus
      │
      │ evaluate fisher relevance
      ▼
Coastal Fisher Beacon
```

This means a coastal hazard does not have to remain isolated as a warning inside the hazard-detection system.

It can become a **coordination signal** for maritime safety.

### Public Play

**Neer Nexus 0.3.0**

https://play.modiqo.ai/bavya21/neer-nexus@0.3.0

---

# 🧩 Why Three Independent Plays?

The systems are intentionally separated.

### Kadalkaval can work independently

It can ingest coastal hazard information and provide early-warning functionality without Neer Nexus.

### Coastal Fisher Beacon can work independently

It can handle a maritime distress event without requiring Kadalkaval.

### Neer Nexus connects them

When information from one safety domain can help another, Neer Nexus provides the coordination layer.

This makes the ecosystem:

* Modular
* Reusable
* Independently runnable
* Easier to test
* Easier to extend
* Safer than tightly coupling every component

---

# ⚙️ How Neer Nexus Works

The current Neer Nexus workflow is a two-step Rote DAG:

```text
IMD CAP/RSS
     │
     ▼
┌─────────────────┐
│  Hazard Ingest  │
└────────┬────────┘
         │
         │ structured process output
         ▼
┌─────────────────┐
│ Coordinate Event│
└────────┬────────┘
         │
         ▼
 Coordination
 Decision
```

The hazard-ingestion process extracts fields such as:

* Event type
* Affected area
* Severity
* Description

These values are passed to the coordination step through Rote value edges.

---

# 🛠️ An Important Engineering Challenge

During development, the first version of the DAG failed even though the hazard-ingestion step itself completed successfully.

The downstream step attempted to resolve:

```text
.event.type
```

directly from the previous process step.

The problem was that `process.exec` exposes the command result as a process observation. The JSON produced by the process was inside:

```text
stdout.text
```

So Rote could not resolve:

```text
.event.type
```

The correct data flow was:

```text
process.exec
     │
     ▼
$.stdout.text
     │
     ▼
  fromjson
     │
     ▼
 .event_type
```

The final value edges therefore use:

```text
@hazard_ingest{$.stdout.text | fromjson | .event_type}
```

and equivalent expressions for area, severity, and description.

This turned the failed integration into a reliable process-to-process data contract.

---

# 🛡️ Handling No-Hazard Conditions

A major reliability requirement was avoiding false emergency notifications.

When the IMD feed contains no relevant coastal hazard, the ingestion step produces an explicit state:

```json
{
  "event_type": "no_relevant_coastal_alert",
  "event_severity": "None"
}
```

Neer Nexus then produces:

```text
no_coordination_required
```

instead of treating the absence of a hazard as an error.

Therefore:

```text
No Hazard
    │
    ▼
No Coordination Required
    │
    ▼
No False Emergency Notification
```

---

# 🔐 Safety Principles

Neer Nexus follows several safety and reliability principles:

* Uses authoritative machine-readable hazard information where available.
* Keeps each Play independently runnable.
* Uses structured data contracts between processing steps.
* Explicitly handles the no-hazard state.
* Does not claim successful notification unless delivery actually succeeds.
* Keeps credentials as runtime parameters rather than source code.
* Does not package runtime credentials or customer data in the repository.
* Separates hazard intelligence from maritime distress handling.

---

# 📦 Repository Structure

```text
neer-nexus/
│
├── coastal-fisher-beacon/
│   ├── main.ts
│   ├── deps.toml
│   └── resources/
│
├── kadalkaval/
│   ├── main.ts
│   ├── deps.toml
│   └── resources/
│
├── neer-nexus/
│   ├── main.ts
│   ├── deps.toml
│   └── resources/
│
└── README.md
```

Each directory contains an independently released Rote Play.

---

# 🚀 Public Plays

| Play                     | Role                                        | Version   |
| ------------------------ | ------------------------------------------- | --------- |
| 🌊 Kadalkaval            | Coastal hazard intelligence & early warning | 0.2.0     |
| 🚨 Coastal Fisher Beacon | Maritime distress & fisher safety           | Published |
| 🔗 Neer Nexus            | Coastal emergency coordination              | 0.3.0     |

---

# 🧰 Built With

* **Modiqo Rote**
* **Deno**
* **TypeScript**
* **IMD CAP/RSS**
* **Telegram Bot API**

---

# 🎯 The Bigger Idea

Neer Nexus is not trying to replace emergency-response organizations.

It explores a smaller but important question:

> **When one system detects danger, can another system receive the right information early enough to act?**

By keeping hazard intelligence, maritime distress, and coordination as separate Plays, the project demonstrates how small autonomous workflows can be composed into a larger safety ecosystem.

**Detect → Understand → Coordinate → Act.**

---

Built with 🌊 **Modiqo Rote** for safer coastal communities.
