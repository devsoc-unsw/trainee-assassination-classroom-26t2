// import { PublicGameState } from "@/shared/types";
// import { useEffect, useState } from "react";

// interface TimerProps {
//   state: PublicGameState;
// }

// export function Timer({ state }: TimerProps) {
//   const [secondsLeft, setSecondsLeft] = useState(0);

//   useEffect(() => {
//     function calc_time() {
//       const phaseEnd = state.phaseEndsAt
//       if (phaseEnd === null) return;
//       const secs = Math.floor((phaseEnd - Date.now()) / 1000);
//       if (secs > 0) {
//         setSecondsLeft(secs);
//       } else {
//         setSecondsLeft(-1);
//       }
//     }
//     calc_time();

//     const interval = setInterval(calc_time, 500);

//     return () => clearInterval(interval);
//   }, [state]);


//   if (secondsLeft >= 0) {
//     return <h1>Time left: {secondsLeft}</h1>;
//   }
// }
