import { Lobby } from "./lobby";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col items-center overflow-hidden font-sans">
      <div
        className="absolute inset-0 -z-10 bg-repeat animate-diagonal-scroll"
        style={{
          backgroundImage: "url('/images/landing-page/landing-page-bg.jpg')",
          backgroundSize: "720px 512px",
          transform: "scale(1.75)",
        }}
      />
      <Lobby />
    </div>
  );
}
