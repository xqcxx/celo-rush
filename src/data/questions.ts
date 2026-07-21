export interface Question {
    prompt: string;
    options: string[];
    correct: number;
}

// Celo trivia used at the gate. The gate selects three different questions
// for every run, while the player can skip the quiz entirely.
export const QUESTIONS: Question[] = [
    { prompt: 'What is Celo’s native token called?', options: ['CELO', 'CUSD', 'CEUR', 'ALFA'], correct: 0 },
    { prompt: 'What kind of network is Celo?', options: ['A mobile-first EVM-compatible blockchain', 'A messaging app', 'A hardware wallet', 'A centralized exchange'], correct: 0 },
    { prompt: 'Which asset is designed to track the US dollar on Celo?', options: ['cUSD', 'CELO', 'cEUR', 'cREAL'], correct: 0 },
    { prompt: 'What does CELO help secure and govern?', options: ['The Celo network', 'Only email accounts', 'A physical payment card', 'A web browser'], correct: 0 },
    { prompt: 'Which virtual machine does Celo support?', options: ['Ethereum Virtual Machine', 'Java Virtual Machine only', 'Nintendo Virtual Machine', 'No virtual machine'], correct: 0 },
    { prompt: 'Which token is associated with the euro on Celo?', options: ['cEUR', 'cUSD', 'CELO', 'cKES'], correct: 0 },
    { prompt: 'Which token is associated with the Brazilian real on Celo?', options: ['cREAL', 'cEUR', 'CELO', 'cGBP'], correct: 0 },
    { prompt: 'What is Celo designed to make easier?', options: ['Mobile-friendly access to digital payments', 'Printing paper newspapers', 'Running desktop games only', 'Mining physical gold'], correct: 0 },
    { prompt: 'What type of consensus does Celo use?', options: ['Proof of stake', 'Proof of paper', 'Proof of purchase', 'No consensus'], correct: 0 },
    { prompt: 'What is Celo’s mainnet chain ID?', options: ['42220', '1', '137', '11155111'], correct: 0 },
    { prompt: 'Which test network is used for Celo development today?', options: ['Celo Sepolia', 'Bitcoin Testnet', 'Solana Devnet', 'Alfajores Mainnet'], correct: 0 },
    { prompt: 'Which older Celo testnet is widely known?', options: ['Alfajores', 'Rinkeby', 'Goerli', 'Mumbai'], correct: 0 },
    { prompt: 'What does cUSD aim to maintain?', options: ['A value close to one US dollar', 'A fixed price of one CELO', 'The price of gold', 'A changing price every block'], correct: 0 },
    { prompt: 'What can CELO be used for on the network?', options: ['Gas fees, governance, and staking', 'Only profile pictures', 'Only email fees', 'Nothing on-chain'], correct: 0 },
    { prompt: 'What is MiniPay?', options: ['A wallet built for mobile payments on Celo', 'A Celo validator hardware device', 'A stablecoin', 'A block explorer'], correct: 0 },
    { prompt: 'Which address format do Celo EVM accounts commonly use?', options: ['0x hexadecimal addresses', 'Email addresses only', 'IBAN numbers only', 'Usernames only'], correct: 0 },
    { prompt: 'What are Celo stable assets generally designed to represent?', options: ['Fiat currency values', 'Validator passwords', 'NFT image pixels', 'Block numbers'], correct: 0 },
    { prompt: 'What can Celo transaction fees sometimes be paid with?', options: ['Supported fee currencies such as stable assets', 'Only physical cash', 'Only NFTs', 'No asset at all'], correct: 0 },
    { prompt: 'What is Celoscan used for?', options: ['Exploring Celo blockchain activity', 'Creating mobile SIM cards', 'Buying laptops', 'Streaming music'], correct: 0 },
    { prompt: 'When did Celo mainnet launch?', options: ['2020', '2010', '2024', '1999'], correct: 0 },
];

export function randomQuestions(count = 3): Question[] {
    return [...QUESTIONS]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(count, QUESTIONS.length))
        .map((question) => {
            const options = question.options.map((option, index) => ({ option, index })).sort(() => Math.random() - 0.5);
            return {
                prompt: question.prompt,
                options: options.map((entry) => entry.option),
                correct: options.findIndex((entry) => entry.index === question.correct),
            };
        });
}
