export interface Rank {
    name: string;
    min: number;
}

export const RANKS: Rank[] = [
    { name: 'Paper Horn', min: 0 },
    { name: 'Trench Calf', min: 1000 },
    { name: 'Green Horn', min: 5000 },
    { name: 'Black Bull', min: 10000 },
    { name: 'Cloud Charger', min: 25000 },
    { name: 'Coldest Breathing', min: 50000 },
];

export function rankFor(distance: number): string {
    let name = RANKS[0].name;
    for (const r of RANKS) {
        if (distance >= r.min) name = r.name;
    }
    return name;
}
