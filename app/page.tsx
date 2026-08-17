import Image from "next/image";
import drawmeleonLogo from "@/public/images/landing-page/drawmeleon-logo.png";
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
      <main className="flex flex-1 w-full max-w-5xl flex-col md:flex-row items-center gap-10 md:gap-16 lg:gap-75 py-12 px-6 sm:py-16 sm:px-8 md:py-24 md:px-12 lg:py-32 lg:px-16">
        <div className="flex flex-1 items-center justify-center">
          <Image
            src={drawmeleonLogo}
            alt="Drawmeleon"
            className="w-full max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg h-auto animate-pulse-scale [--logo-scale:1] sm:[--logo-scale:1.1] md:[--logo-scale:1.25] lg:[--logo-scale:1.4] xl:[--logo-scale:1.75]"
            priority
          />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <Lobby />
        </div>
      </main>
    </div>
  );
}
