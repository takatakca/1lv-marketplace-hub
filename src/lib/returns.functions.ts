import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const approveReturnRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      returnRequestId: string;
      amount: number;
      note?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    if (
      !data.returnRequestId ||
      typeof data.amount !== "number" ||
      !Number.isFinite(data.amount) ||
      data.amount <= 0
    ) {
      throw new Error("Valid return request and refund amount are required.");
    }

    const { data: isAdmin, error: roleError } = await context.supabase.rpc(
      "has_role",
      {
        _user_id: context.userId,
        _role: "admin",
      },
    );
    if (roleError || isAdmin !== true) {
      throw new Error("Forbidden");
    }

    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: result, error } = await supabaseAdmin.rpc(
      "reserve_return_refund" as never,
      {
        _return_request_id: data.returnRequestId,
        _amount: data.amount,
        _actor: context.userId,
        _note: data.note?.trim() || null,
      } as never,
    );
    if (error) throw new Error(error.message);

    const value = result as unknown as {
      ok?: boolean;
      return_request_id?: string;
      refund_record_id?: string;
      amount?: number;
      status?: string;
    };

    if (
      value.ok !== true ||
      typeof value.return_request_id !== "string" ||
      typeof value.refund_record_id !== "string"
    ) {
      throw new Error("Return refund reservation returned an invalid result.");
    }

    return value;
  });
