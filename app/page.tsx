import SocketListener from "./socket-listener";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <SocketListener />
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-center py-32 px-16">
        <p>Hello what's up :)</p>
      </main>
    </div>
  );
}
