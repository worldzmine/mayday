import Console from '@/components/mayday/console';
import { CHALLENGES, publicChallenge } from '@/lib/mayday/challenges';
import Landing from '@/components/mayday/landing';
export default async function Home({searchParams}:{searchParams:Promise<{rescue?:string}>}) { const query=await searchParams;return query.rescue?<Console challenges={CHALLENGES.map(publicChallenge)}/>:<Landing/>; }
