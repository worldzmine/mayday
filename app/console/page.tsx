import Console from '@/components/mayday/console';
import { CHALLENGES, publicChallenge } from '@/lib/mayday/challenges';
export default function Dispatch(){return <Console challenges={CHALLENGES.map(publicChallenge)}/>;}
