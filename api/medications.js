export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { action } = req.query;
  try {
    if (action === "rxnorm")       return await lookupRxNorm(req, res);
    if (action === "dosing")       return await lookupDosing(req, res);
    if (action === "interactions") return await checkInteractions(req, res);
    return res.status(400).json({ error: "Invalid action" });
  } catch (err) {
    console.error("Medication API error:", err);
    return res.status(500).json({ error: "Service error" });
  }
}

// ── RxNorm: normalize medication name → RxCUI ─────────────────────────────────
async function lookupRxNorm(req, res) {
  const { name } = req.query;
  if (!name) return res.status(400).json({ error: "name required" });

  const r = await fetch(
    `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}&search=1`
  );
  const data = await r.json();
  const rxcui = data?.idGroup?.rxnormId?.[0] ?? null;
  return res.status(200).json({ rxcui });
}

// ── OpenFDA: dosing frequency from drug label ─────────────────────────────────
async function lookupDosing(req, res) {
  const { rxcui, name } = req.query;
  if (!rxcui && !name) return res.status(400).json({ error: "rxcui or name required" });

  const primary = rxcui
    ? `openfda.rxcui:"${rxcui}"`
    : `openfda.generic_name:"${name}"`;

  let result = await fetchFdaLabel(primary);

  // Fallback: try brand name search if generic fails
  if (!result && name) {
    result = await fetchFdaLabel(`openfda.brand_name:"${name}"`);
  }

  return res.status(200).json(result ?? { dosing: null, frequency: null, rxcui: null });
}

async function fetchFdaLabel(searchQuery) {
  const r = await fetch(
    `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(searchQuery)}&limit=1`
  );
  if (!r.ok) return null;
  const data = await r.json();
  const label = data?.results?.[0];
  if (!label) return null;

  const dosingText = label.dosage_and_administration?.[0] ?? "";
  return {
    dosing: dosingText.slice(0, 400) || null,
    frequency: extractFrequency(dosingText),
    rxcui: label.openfda?.rxcui?.[0] ?? null,
    brandNames: label.openfda?.brand_name?.slice(0, 3) ?? [],
    pharmClass: label.openfda?.pharm_class_epc?.[0] ?? null,
  };
}

function extractFrequency(text) {
  const patterns = [
    /once\s+daily/i,
    /twice\s+daily/i,
    /three\s+times\s+(a\s+)?daily/i,
    /four\s+times\s+(a\s+)?daily/i,
    /every\s+\d+\s+hours?/i,
    /\d+\s+times?\s+(a\s+)?(day|daily|week|weekly)/i,
    /as\s+needed/i,
    /once\s+weekly/i,
    /once\s+monthly/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0].replace(/\s+/g, " ").trim();
  }
  return null;
}

// ── Drug-drug interactions: DrugBank (preferred) or OpenFDA fallback ─────────
// DrugBank requires DRUGBANK_API_KEY env var (free non-commercial account at
// drugbank.com). Without it, falls back to scanning OpenFDA label text.
async function checkInteractions(req, res) {
  const { names } = req.query;
  if (!names) return res.status(400).json({ error: "names required" });

  const nameList = names.split(",").map((n) => n.trim()).filter(Boolean);
  if (nameList.length < 2) {
    return res.status(400).json({ error: "At least 2 medication names required" });
  }

  const apiKey = process.env.DRUGBANK_API_KEY;
  if (apiKey) {
    return await checkInteractionsDrugBank(nameList, apiKey, res);
  }
  return await checkInteractionsOpenFDA(nameList, res);
}

// DrugBank path ────────────────────────────────────────────────────────────────
async function checkInteractionsDrugBank(nameList, apiKey, res) {
  const ids = await Promise.all(nameList.map((n) => resolveDrugBankId(n, apiKey)));
  const validIds = ids.filter(Boolean);

  if (validIds.length < 2) {
    return res.status(200).json({ interactions: [], source: "drugbank",
      message: "Could not resolve enough drug identifiers" });
  }

  const params = new URLSearchParams();
  validIds.forEach((id) => params.append("drugbank-id[]", id));

  const r = await fetch(`https://api.drugbank.com/v1/ddi?${params}`, {
    headers: { Authorization: apiKey, Accept: "application/json" },
  });

  if (!r.ok) {
    console.error("DrugBank DDI error:", r.status, await r.text());
    // Fall through to OpenFDA on DrugBank error
    return await checkInteractionsOpenFDA(nameList, res);
  }

  const data = await r.json();
  const interactions = (Array.isArray(data) ? data : []).map((i) => ({
    drug1: i.product_1?.name ?? "",
    drug2: i.product_2?.name ?? "",
    severity: i.severity ?? "unknown",
    description: (i.description ?? "").slice(0, 250),
  }));

  return res.status(200).json({ interactions, source: "drugbank" });
}

async function resolveDrugBankId(name, apiKey) {
  try {
    const r = await fetch(
      `https://api.drugbank.com/v1/drugs?q=${encodeURIComponent(name)}&fuzzy_search=true&hits_per_page=1`,
      { headers: { Authorization: apiKey, Accept: "application/json" } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    return data?.hits?.[0]?.drugbank_id ?? null;
  } catch {
    return null;
  }
}

// OpenFDA fallback path ────────────────────────────────────────────────────────
// Fetches each drug's label, then scans its drug_interactions section for
// mentions of the other drugs by name. Returns matches as "possible" severity.
async function checkInteractionsOpenFDA(nameList, res) {
  const labels = await Promise.all(nameList.map(fetchLabelForInteractions));

  const interactions = [];
  for (let i = 0; i < nameList.length; i++) {
    const interactionText = labels[i];
    if (!interactionText) continue;
    const textLower = interactionText.toLowerCase();

    for (let j = 0; j < nameList.length; j++) {
      if (i === j) continue;
      // Check both the full name and each word (catches "metformin" inside "metformin HCl")
      const tokens = nameList[j].toLowerCase().split(/\s+/);
      const matched = tokens.some((t) => t.length > 3 && textLower.includes(t));
      if (matched) {
        // Avoid duplicate pairs (A+B and B+A)
        const alreadyAdded = interactions.some(
          (x) => x.drug1 === nameList[j] && x.drug2 === nameList[i]
        );
        if (!alreadyAdded) {
          // Extract a relevant sentence containing the mention
          const sentences = interactionText.split(/(?<=[.!?])\s+/);
          const snippet = sentences.find((s) =>
            tokens.some((t) => t.length > 3 && s.toLowerCase().includes(t))
          ) ?? "";

          interactions.push({
            drug1: nameList[i],
            drug2: nameList[j],
            severity: "possible",
            description: snippet.slice(0, 250) || `${nameList[j]} is mentioned in the ${nameList[i]} interaction warnings.`,
          });
        }
      }
    }
  }

  return res.status(200).json({ interactions, source: "openfda" });
}

async function fetchLabelForInteractions(name) {
  // Try RxCUI-based lookup first for precision, fall back to name search
  try {
    const rxRes = await fetch(
      `https://rxnav.nlm.nih.gov/REST/rxcui.json?name=${encodeURIComponent(name)}&search=1`
    );
    const rxData = await rxRes.json();
    const rxcui = rxData?.idGroup?.rxnormId?.[0];

    const query = rxcui
      ? `openfda.rxcui:"${rxcui}"`
      : `openfda.generic_name:"${name}"`;

    let r = await fetch(
      `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(query)}&limit=1`
    );
    // Fallback to brand name if generic not found
    if (!r.ok) {
      r = await fetch(
        `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(`openfda.brand_name:"${name}"`)}&limit=1`
      );
    }
    if (!r.ok) return null;
    const data = await r.json();
    return data?.results?.[0]?.drug_interactions?.[0] ?? null;
  } catch {
    return null;
  }
}
