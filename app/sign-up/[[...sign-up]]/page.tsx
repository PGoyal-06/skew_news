import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-bg-primary px-6 py-16">
      <SignUp />
    </main>
  );
}
