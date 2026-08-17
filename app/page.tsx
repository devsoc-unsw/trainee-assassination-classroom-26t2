import { Lobby } from "./lobby";

export default function Home() {
  return (
    <div className="relative flex flex-col flex-1 items-center justify-center overflow-hidden font-sans">
      <div
        className="absolute inset-0 -z-10 bg-repeat animate-diagonal-scroll"
        style={{
          backgroundImage: "url('/images/landing-page/landing-page-bg.jpg')",
          backgroundSize: "720px 512px",
          transform: "scale(1.75)",
        }}
      />
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-center py-32 px-16">
        <Lobby />
      </main>
    </div>
  );
}
