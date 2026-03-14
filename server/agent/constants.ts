// Correspondent banking lookup constants used across agent workflows and services.
// Single source of truth — imported by cbDiscoveryService for backward-compat re-export.

export const COUNTRY_RTGS: Record<string, string> = {
  "Austria": "TARGET2", "Belgium": "TARGET2", "Croatia": "TARGET2", "Cyprus": "TARGET2",
  "Estonia": "TARGET2", "Finland": "TARGET2", "France": "TARGET2", "Germany": "TARGET2",
  "Greece": "TARGET2", "Ireland": "TARGET2", "Italy": "TARGET2", "Latvia": "TARGET2",
  "Lithuania": "TARGET2", "Luxembourg": "TARGET2", "Malta": "TARGET2", "Netherlands": "TARGET2",
  "Portugal": "TARGET2", "Slovakia": "TARGET2", "Slovenia": "TARGET2", "Spain": "TARGET2",
  "Czech Republic": "CERTIS", "Hungary": "VIBER", "Poland": "SORBNET2", "Romania": "ReGIS",
  "Sweden": "RIX", "Denmark": "Kronos2", "Norway": "NICS", "Switzerland": "SIC",
  "United Kingdom": "CHAPS",
  "United States": "Fedwire", "Canada": "Lynx", "Brazil": "STR", "Mexico": "SPEI",
  "Australia": "RITS", "Japan": "BOJ-NET", "Singapore": "MEPS+", "Hong Kong": "CHATS",
  "China": "CNAPS", "India": "RTGS (RBI)", "South Korea": "BOK-Wire+",
  "South Africa": "SAMOS", "Israel": "ZAHAV", "Turkey": "EFT",
  "United Arab Emirates": "UAEFTS", "New Zealand": "ESAS",
  "Bulgaria": "RINGS", "Bahrain": "RTGS-BD", "Chile": "LBTR", "Colombia": "CUD",
  "Egypt": "RTGS", "Indonesia": "BI-RTGS", "Kenya": "KEPSS", "Kuwait": "KASSIP",
  "Morocco": "SRBM", "Malaysia": "RENTAS", "Nigeria": "NIP", "Oman": "RTGS",
  "Peru": "LBTR", "Philippines": "PhilPaSS", "Qatar": "QATCH",
  "Saudi Arabia": "SARIE", "Thailand": "BAHTNET", "Taiwan": "CIFS",
};

export const CURRENCY_COUNTRY: Record<string, string> = {
  "USD": "United States", "EUR": "Eurozone", "GBP": "United Kingdom",
  "AED": "United Arab Emirates", "AUD": "Australia", "BGN": "Bulgaria",
  "BHD": "Bahrain", "BRL": "Brazil", "CAD": "Canada", "CHF": "Switzerland",
  "CLP": "Chile", "CNH": "China", "CNY": "China", "COP": "Colombia",
  "CZK": "Czech Republic", "DKK": "Denmark", "EGP": "Egypt",
  "HKD": "Hong Kong", "HUF": "Hungary", "IDR": "Indonesia",
  "ILS": "Israel", "INR": "India", "JPY": "Japan", "KES": "Kenya",
  "KRW": "South Korea", "KWD": "Kuwait", "MAD": "Morocco", "MXN": "Mexico",
  "MYR": "Malaysia", "NGN": "Nigeria", "NOK": "Norway", "NZD": "New Zealand",
  "OMR": "Oman", "PEN": "Peru", "PHP": "Philippines", "PLN": "Poland",
  "QAR": "Qatar", "RON": "Romania", "SAR": "Saudi Arabia", "SEK": "Sweden",
  "SGD": "Singapore", "THB": "Thailand", "TRY": "Turkey", "TWD": "Taiwan",
  "ZAR": "South Africa",
};

export const COUNTRY_CURRENCY: Record<string, string> = Object.fromEntries(
  Object.entries(CURRENCY_COUNTRY).filter(([, v]) => v !== "Eurozone").map(([k, v]) => [v, k]),
);

export const EUROZONE_COUNTRIES = new Set([
  "Austria", "Belgium", "Croatia", "Cyprus", "Estonia", "Finland", "France", "Germany",
  "Greece", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands",
  "Portugal", "Slovakia", "Slovenia", "Spain",
]);

export const CLS_CURRENCIES = new Set([
  "AUD", "CAD", "CHF", "DKK", "EUR", "GBP", "HKD", "JPY", "MXN",
  "NOK", "NZD", "SEK", "SGD", "USD", "ILS", "ZAR", "KRW", "HUF",
]);
