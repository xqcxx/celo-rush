export interface Question {
    prompt: string;
    options: string[];
    correct: number;
}

// The gate initiation. Some answers are deliberately funny — that's the hook.
// Q2's correct answer uses the clean phrasing.
export const QUESTIONS: Question[] = [
    {
        prompt: 'In whose name do you come unto me?',
        options: ['MERT', 'ANSEM', 'COBIE', 'CZ'],
        correct: 1,
    },
    {
        prompt: 'Who is Ansem?',
        options: ["EPSTEIN'S FIRST SON", 'THE COLDEST NIGGA BREATHING', "TAYLOR SWIFT'S HUSBAND", 'THE GRINCH'],
        correct: 1,
    },
    {
        prompt: 'What bull charges forward in his name?',
        options: ['$WIF', '$BONK', 'THE BLACK BULL ($ANSEM)', '$ETH'],
        correct: 2,
    },
];
