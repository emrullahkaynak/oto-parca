
-- Parts additions
ALTER TABLE public.parts
  ADD COLUMN IF NOT EXISTS oem_code text,
  ADD COLUMN IF NOT EXISTS barcode text,
  ADD COLUMN IF NOT EXISTS vehicle_make text,
  ADD COLUMN IF NOT EXISTS vehicle_model text,
  ADD COLUMN IF NOT EXISTS vehicle_year_from int,
  ADD COLUMN IF NOT EXISTS vehicle_year_to int;

CREATE INDEX IF NOT EXISTS parts_oem_code_idx ON public.parts (oem_code);
CREATE INDEX IF NOT EXISTS parts_barcode_idx ON public.parts (barcode);

-- Sales additions
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payment_type text NOT NULL DEFAULT 'nakit',
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0;

-- Customer balance (positive = customer owes us)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS balance numeric NOT NULL DEFAULT 0;

-- Customer transactions
CREATE TABLE IF NOT EXISTS public.customer_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  type text NOT NULL, -- 'borc' (debt added) | 'tahsilat' (payment received)
  amount numeric NOT NULL,
  notes text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_transactions TO authenticated;
GRANT ALL ON public.customer_transactions TO service_role;

ALTER TABLE public.customer_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read customer_transactions" ON public.customer_transactions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write customer_transactions" ON public.customer_transactions
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update customer_transactions" ON public.customer_transactions
  FOR UPDATE TO authenticated USING (true);
CREATE POLICY "auth delete customer_transactions" ON public.customer_transactions
  FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS customer_transactions_customer_idx ON public.customer_transactions(customer_id);

-- Trigger: when a sale is inserted, if veresiye and unpaid portion exists, add to customer balance and log transaction
CREATE OR REPLACE FUNCTION public.handle_sale_balance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  outstanding numeric;
BEGIN
  outstanding := COALESCE(NEW.total, 0) - COALESCE(NEW.paid_amount, 0);
  IF NEW.customer_id IS NOT NULL AND outstanding > 0 AND NEW.payment_type = 'veresiye' THEN
    UPDATE public.customers SET balance = COALESCE(balance, 0) + outstanding WHERE id = NEW.customer_id;
    INSERT INTO public.customer_transactions (customer_id, sale_id, type, amount, notes)
    VALUES (NEW.customer_id, NEW.id, 'borc', outstanding, 'Veresiye satış #' || NEW.sale_no);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_handle_sale_balance ON public.sales;
CREATE TRIGGER trg_handle_sale_balance
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.handle_sale_balance();
