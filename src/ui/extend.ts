// "Keep this entry one more year": the lawyer view's way to extend an entry the writer allowed to be
// extended. A throwaway key pays the small network fee. It is made once per page, lives only in this
// variable, and is never written anywhere. It cannot read anything: extending needs no journal key.
import type { Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { explorerTx, extendEntry, publicClient, type JournalItem } from "../arkiv/journal";
import { errText, h, link } from "./dom";
import { ensureFunded } from "./fund";

let throwaway: Hex | undefined;
const payerKey = (): Hex => (throwaway ??= generatePrivateKey());

/** One extension at a time from this page: they share one key, so one nonce. */
let queue: Promise<unknown> = Promise.resolve();
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job);
  queue = run.catch(() => undefined);
  return run;
}

/** Plain words, first line only (chain errors can run to many lines). */
function plain(e: unknown): string {
  if (e instanceof TypeError) return "Could not reach the service that pays the small network fee. Check the connection and try again.";
  return errText(e).split("\n")[0]!;
}

export function longDate(blocksFromNow: bigint): string {
  const when = new Date(Date.now() + Number(blocksFromNow) * 2000);
  return when.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

/** The control shown in an entry's proof area. `onExtended` lets the entry refresh its own rows. */
export function keepControl(item: JournalItem, onExtended?: (expiresAt: bigint, nowBlock: bigint) => void): HTMLElement {
  if (!item.permissionlessExtension) {
    return h("p", { class: "keep-note" }, "Kept for exactly the time its writer chose.");
  }
  const status = h("p", { class: "keep-status", role: "status" });
  const btn = h("button", { type: "button" }, "Keep this entry one more year");
  const say = (m: string): void => {
    status.className = "keep-status";
    status.textContent = m;
  };
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    say("Preparing...");
    try {
      const done = await inTurn(async () => {
        await ensureFunded(privateKeyToAccount(payerKey()).address, say);
        say("Keeping the entry longer...");
        const r = await extendEntry(payerKey(), item.key, 1);
        const nowBlock = await publicClient.getBlockNumber();
        return { ...r, nowBlock };
      });
      status.className = "keep-status ok";
      status.replaceChildren(
        `Kept longer. It now lasts until about ${longDate(done.expiresAt - done.nowBlock)}. `,
        link(explorerTx(done.txHash), "See the extension transaction"),
      );
      btn.textContent = "Keep it another year";
      onExtended?.(done.expiresAt, done.nowBlock);
    } catch (e) {
      status.className = "keep-status error";
      status.textContent = plain(e);
    } finally {
      btn.disabled = false;
    }
  });
  return h("div", { class: "keep no-print" }, btn, status);
}
