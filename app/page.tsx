import { redirect } from "next/navigation";

// Task 22 setzt hier die Today-Seite hin; bis dahin ist Customers der Einstieg.
export default function Home() {
  redirect("/customers");
}
