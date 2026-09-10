import { Skeleton } from "@/app/shell/ui";
import { Blatt, Blattkopf } from "@/app/shell/blattkopf";
import form from "./campaign-form.module.css";

/** Match the task picker's layout while customer and account data loads. */
export default function Loading() {
  return (
    <div aria-busy aria-label="Kampagnenformular wird geladen">
      <Blattkopf titel="Neue Kampagne" meaning="add" stand="Deine Werbekonten und Kunden werden geladen…" />
      <Blatt>
        <div className={form.wizard}>
          <div className={form.shell} aria-hidden>
            <div className={form.steps}>
              <ol>{[0, 1, 2].map(i => <li key={i}><div className={form.stepButton}>
                <Skeleton width={36} height={36} radius="rounded" />
                <div className="grid gap-2"><Skeleton width={72} height={16} /><Skeleton width={96} height={12} className="hidden sm:block" /></div>
              </div></li>)}</ol>
            </div>
          </div>
          <div className={form.taskShell} aria-hidden>
            <div className={form.taskHeader}><div><Skeleton width="60%" height={24} /><Skeleton width="85%" height={16} /></div></div>
            <div className={form.taskTools}><Skeleton width="100%" height={104} radius={2} /><Skeleton width="100%" height={104} radius={2} /></div>
            <div className={form.taskList}>{[0, 1, 2].map(i => <div key={i} className={form.taskRow}><Skeleton height={56} width="100%" radius={2} index={i} /></div>)}</div>
          </div>
        </div>
      </Blatt>
    </div>
  );
}
