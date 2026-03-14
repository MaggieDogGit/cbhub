import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function researchBank(bankName: string): Promise<Record<string, any>> {
  const searchResponse = await openai.chat.completions.create({
    model: "gpt-4o-search-preview",
    messages: [
      {
        role: "user",
        content: `Search for current information about "${bankName}" correspondent banking services, currencies they clear, RTGS memberships, CLS membership, and their role as a correspondent bank. Include their headquarters country and whether they are a G-SIB.`,
      },
    ],
  } as any);
  const webContext = searchResponse.choices[0].message.content || "";

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: "You are a correspondent banking expert. Return only valid JSON.",
      },
      {
        role: "user",
        content: `Based on the following up-to-date web research, structure the correspondent banking information for "${bankName}" as JSON.

Web research:
${webContext}

Return ONLY a valid JSON object like this:
{
  "bank": "${bankName}",
  "headquarters": "Country name",
  "gsib": true or false,
  "services": [
    {
      "currency": "USD",
      "service_type": "Correspondent Banking",
      "rtgs_membership": true,
      "instant_scheme_access": false,
      "cls_member": true,
      "nostro_accounts_offered": true,
      "vostro_accounts_offered": true,
      "target_clients": "Banks, Payment Institutions",
      "source": "Web search"
    }
  ]
}

Service type must be one of: Correspondent Banking, Currency Clearing, RTGS Participation, Instant Payments Access, FX Liquidity, CLS Settlement, Custody Services, Transaction Banking, Liquidity Services.
Currencies must be from: EUR, USD, GBP, JPY, CHF, CAD, AUD, SGD, HKD, CNH, SEK, NOK, DKK, PLN, CZK, HUF, RON, TRY, ZAR, BRL, MXN, INR.
Only include currencies and services you found evidence for in the research.`,
      },
    ],
  });
  return JSON.parse(response.choices[0].message.content || "{}");
}
