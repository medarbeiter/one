/**
 * Die Obergrenze für freie Hinweise an die KI – dieselbe Zahl an der Route
 * (app/api/brief) und im Feld (auftrag.tsx). Mehr Hinweis ist kein Hinweis
 * mehr, und ein Prompt, der Mistral sprengt.
 */
export const MAX_AI_NOTES = 4000;
