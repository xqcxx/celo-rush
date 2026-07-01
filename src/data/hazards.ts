export type Kind =
    | 'jeet'
    | 'sniper'
    | 'mev'
    | 'redCandle'
    | 'rug'
    | 'greenCandle'
    | 'diamondHorns'
    | 'stimmy'
    | 'blackCloud';

export interface HazardCfg {
    damage: number | 'instant';
    dashBreakable: boolean;
    powerup: boolean;
    cause: string;
    minTier: number;
}

export const HAZARDS: Record<Kind, HazardCfg> = {
    jeet: { damage: 1, dashBreakable: true, powerup: false, cause: 'YOU GOT JEETED.', minTier: 0 },
    redCandle: { damage: 1, dashBreakable: true, powerup: false, cause: 'RED CANDLE GOT YOU.', minTier: 1 },
    rug: { damage: 1, dashBreakable: true, powerup: false, cause: 'THE RUG OPENED.', minTier: 2 },
    sniper: { damage: 2, dashBreakable: false, powerup: false, cause: 'SNIPER CAUGHT YOU.', minTier: 1 },
    mev: { damage: 'instant', dashBreakable: false, powerup: false, cause: 'MEV WIPED THE RUN.', minTier: 3 },
    greenCandle: { damage: 0, dashBreakable: false, powerup: true, cause: '', minTier: 0 },
    diamondHorns: { damage: 0, dashBreakable: false, powerup: true, cause: '', minTier: 1 },
    stimmy: { damage: 0, dashBreakable: false, powerup: true, cause: '', minTier: 2 },
    blackCloud: { damage: 0, dashBreakable: false, powerup: true, cause: '', minTier: 2 },
};

export const HAZARD_KINDS: Kind[] = ['jeet', 'redCandle', 'rug', 'sniper', 'mev'];
export const POWERUP_KINDS: Kind[] = ['greenCandle', 'diamondHorns', 'stimmy', 'blackCloud'];

// Powerup rarity (Black Cloud is the rare ultimate).
export const POWERUP_WEIGHT: Record<string, number> = { greenCandle: 5, diamondHorns: 4, stimmy: 4, blackCloud: 1 };
