import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { receiptQuery } from "@/lib/queries";
import { formatDateTime, formatMoney } from "@/lib/stock";
import { BrandMark } from "./Brand";

export function ReceiptDialog({ receiptNo, onClose }: { receiptNo: string | null; onClose: () => void }) {
  return (
    <Dialog open={!!receiptNo} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader className="no-print">
          <DialogTitle>Sales receipt</DialogTitle>
        </DialogHeader>
        {receiptNo && <ReceiptBody receiptNo={receiptNo} />}
      </DialogContent>
    </Dialog>
  );
}

function ReceiptBody({ receiptNo }: { receiptNo: string }) {
  const { data: lines = [], isPending } = useQuery(receiptQuery(receiptNo));
  const total = lines.reduce((s, l) => s + l.quantity * Number(l.unit_price), 0);
  const first = lines[0];
  return (
    <div>
      <div id="receipt-print" className="rounded-lg border border-dashed bg-background p-4 font-mono text-xs">
        <div className="mb-3 flex items-center gap-2 border-b border-dashed pb-3">
          <BrandMark className="h-6 w-6" />
          <div>
            <div className="font-display text-sm font-semibold">PharmaStock Pharmacy</div>
            <div className="text-muted-foreground">Official sales receipt</div>
          </div>
        </div>
        {isPending ? (
          <div className="py-6 text-center text-muted-foreground">Loading…</div>
        ) : (
          <>
            <div className="space-y-0.5">
              <div className="flex justify-between"><span>Receipt</span><span>{receiptNo}</span></div>
              {first && <div className="flex justify-between"><span>Date</span><span>{formatDateTime(first.created_at)}</span></div>}
              {first && <div className="flex justify-between"><span>Served by</span><span>{first.user_name}</span></div>}
              {first?.customer_name && <div className="flex justify-between"><span>Customer</span><span>{first.customer_name}</span></div>}
            </div>
            <div className="my-3 border-t border-dashed" />
            <table className="w-full">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="font-normal">Item</th>
                  <th className="text-right font-normal">Qty</th>
                  <th className="text-right font-normal">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="align-top">
                    <td className="py-1 pr-2">
                      {l.medicine?.name}
                      <div className="text-muted-foreground">@ {formatMoney(l.unit_price)}</div>
                    </td>
                    <td className="py-1 text-right">{l.quantity}</td>
                    <td className="py-1 text-right">{formatMoney(l.quantity * Number(l.unit_price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="my-3 border-t border-dashed" />
            <div className="flex justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{formatMoney(total)}</span>
            </div>
            <div className="mt-4 text-center text-muted-foreground">Thank you. Get well soon.</div>
          </>
        )}
      </div>
      <div className="no-print mt-4 flex justify-end">
        <Button onClick={() => printReceipt()} disabled={isPending}>
          <Printer className="h-4 w-4" /> Print receipt
        </Button>
      </div>
    </div>
  );
}

function printReceipt() {
  const el = document.getElementById("receipt-print");
  if (!el) return;
  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) {
    window.print();
    return;
  }
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join("");
  w.document.write(`<html><head><title>Receipt</title>${styles}</head><body style="padding:16px">${el.outerHTML}</body></html>`);
  w.document.close();
  w.onload = () => {
    w.focus();
    w.print();
  };
}
