/** Fake support agents. In production this comes from your auth/SSO session. */
export interface SupportAgent {
  id: string;
  name: string;
  team: 'tier1' | 'tier2' | 'b2b';
  tenureMonths: number;
}

export const SUPPORT_AGENTS: SupportAgent[] = [
  { id: 'agt_sam', name: 'Sam Rivera', team: 'tier1', tenureMonths: 2 },
  { id: 'agt_noor', name: 'Noor Haddad', team: 'tier1', tenureMonths: 14 },
  { id: 'agt_kenji', name: 'Kenji Watanabe', team: 'tier2', tenureMonths: 30 },
  { id: 'agt_olivia', name: 'Olivia Brooks', team: 'b2b', tenureMonths: 22 },
  { id: 'agt_arjun', name: 'Arjun Mehta', team: 'tier1', tenureMonths: 6 },
];
