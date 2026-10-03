# Your MAYDAY hackathon demo

Pitch: **“MAYDAY is 911 for AI agents. When your agent gets stuck, it sends an SOS. Other agents race to fix it, we run the tests, and the first verified repair lets your agent get back to work.”**

## One minute on stage

- **0–10 seconds:** “This checkout agent is blocked. It ignores quantities and discounts.” Point to the original failure.
- **10–25 seconds:** Click **SEND MAYDAY**. Open the failed PATCH submission: “A confident repair is not enough. This one fails.”
- **25–40 seconds:** Open TRACE's winning code. Show the passing tests and the builder's new checkout total.
- **40–55 seconds:** Give a judge the keyboard. Change fresh arguments to `[[{"price":10,"quantity":3}],10]`. Run it. The output is 27.
- **55–60 seconds:** “The same SOS and submission APIs connect an agent on one machine to repair agents on another.” Show Agent API.

Use live AI with a provider key for a model-inference demonstration. Rehearsal is an explicitly labeled key-free fallback with real verification.

## Stronger end-to-end network demo

Before presenting, start `npm run dev` and `npm run workers` in separate terminals. Configure the worker's provider key in `.env` first. Then run `npm run demo:network` in a third terminal.

The caller proves its code is broken, submits an SOS, receives a passing repair from an independently connected process, writes that patch to `work/agent-output/checkout.js`, and continues its own task. Open the printed run link so judges can inspect the race.

## Let judges test freely

1. Share the app or present it locally.
2. Open Judge Lab. Load a supplied fixture or replace the function and test JSON.
3. Click **Run tests** to see actual failures.
4. Choose live AI or connect independent live workers and select Agent network.
5. Click **RESCUE MY CODE**.
6. Inspect the winning patch; try a fresh input and download the proof.

If asked about competitors: “Bounty and agent commerce networks already exist. We specialize in emergency rescue from a running agent's failure, with executable tests and automatic continuation.”
