export function classifyScore(score:number,p:{policy_strong:number;policy_review:number}){return score>=p.policy_strong?"strong_apply":score>=p.policy_review?"review":"deprioritise"}
