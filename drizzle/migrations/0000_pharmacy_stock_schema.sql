
-- ===== Enums =====
CREATE TYPE public.app_role AS ENUM ('admin', 'pharmacist', 'storekeeper');
CREATE TYPE public.transaction_type AS ENUM ('IN', 'OUT', 'ADJUST');
CREATE TYPE public.alert_type AS ENUM ('LOW_STOCK', 'OUT_OF_STOCK');
CREATE TYPE public.alert_status AS ENUM ('ACTIVE', 'RESOLVED');

-- ===== Shared updated_at trigger =====
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- ===== Profiles =====
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL,
  full_name text NOT NULL,
  email text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_username_lower_key ON public.profiles (lower(username));
GRANT SELECT ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== Roles =====
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ===== Role helpers (active accounts only) =====
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = _user_id AND r.role = _role AND p.is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = _user_id AND r.role = ANY(_roles) AND p.is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_any_role(_user_id, ARRAY['admin','pharmacist','storekeeper']::public.app_role[])
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid, public.app_role[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

CREATE POLICY "View own profile or all as admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "View own roles or all as admin" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Auto-create a profile when an auth account is created (roles are assigned by admins only)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_username text;
BEGIN
  v_username := lower(coalesce(nullif(trim(NEW.raw_user_meta_data->>'username'), ''), split_part(NEW.email, '@', 1)));
  IF EXISTS (SELECT 1 FROM public.profiles WHERE lower(username) = v_username) THEN
    v_username := v_username || '-' || substr(NEW.id::text, 1, 6);
  END IF;
  INSERT INTO public.profiles (id, username, full_name, email)
  VALUES (
    NEW.id,
    v_username,
    coalesce(nullif(trim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(NEW.email, '@', 1)),
    coalesce(NEW.email, '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== Activity log (immutable) =====
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_name text NOT NULL DEFAULT 'System',
  action text NOT NULL,
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_logs_created_idx ON public.activity_logs (created_at DESC);
GRANT SELECT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view activity log" ON public.activity_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public._write_log(_action text, _details text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
BEGIN
  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  INSERT INTO public.activity_logs (user_id, user_name, action, details)
  VALUES (auth.uid(), coalesce(v_name, 'System'), _action, _details);
END $$;
REVOKE EXECUTE ON FUNCTION public._write_log(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_auth_event(_event text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF _event NOT IN ('LOGOUT', 'PASSWORD_RESET') THEN
    RAISE EXCEPTION 'Unsupported event';
  END IF;
  PERFORM public._write_log(_event, CASE WHEN _event = 'LOGOUT' THEN 'Signed out' ELSE 'Password changed via reset link' END);
END $$;
REVOKE EXECUTE ON FUNCTION public.log_auth_event(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_auth_event(text) TO authenticated;

-- ===== Medicines =====
CREATE TABLE public.medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  generic_name text,
  category text NOT NULL,
  unit text NOT NULL DEFAULT 'Pack',
  current_stock integer NOT NULL DEFAULT 0 CHECK (current_stock >= 0),
  minimum_level integer NOT NULL DEFAULT 10 CHECK (minimum_level >= 0),
  unit_price numeric(12,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX medicines_name_lower_key ON public.medicines (lower(name));
GRANT SELECT ON public.medicines TO authenticated;
GRANT INSERT (name, generic_name, category, unit, minimum_level, unit_price) ON public.medicines TO authenticated;
GRANT UPDATE (name, generic_name, category, unit, minimum_level, unit_price, is_active) ON public.medicines TO authenticated;
GRANT ALL ON public.medicines TO service_role;
ALTER TABLE public.medicines ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER medicines_updated_at BEFORE UPDATE ON public.medicines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "Staff view medicines" ON public.medicines
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Admins add medicines" ON public.medicines
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins edit medicines" ON public.medicines
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== Stock transactions =====
CREATE SEQUENCE public.receipt_seq;

CREATE TABLE public.stock_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id uuid NOT NULL REFERENCES public.medicines(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  transaction_type public.transaction_type NOT NULL,
  quantity integer NOT NULL,
  balance_after integer NOT NULL,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  receipt_no text,
  customer_name text,
  supplier text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_transactions_created_idx ON public.stock_transactions (created_at DESC);
CREATE INDEX stock_transactions_medicine_idx ON public.stock_transactions (medicine_id);
CREATE INDEX stock_transactions_receipt_idx ON public.stock_transactions (receipt_no);
GRANT SELECT ON public.stock_transactions TO authenticated;
GRANT ALL ON public.stock_transactions TO service_role;
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view transactions" ON public.stock_transactions
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ===== Alerts =====
CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id uuid NOT NULL REFERENCES public.medicines(id) ON DELETE CASCADE,
  alert_type public.alert_type NOT NULL,
  message text NOT NULL,
  status public.alert_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by_name text
);
CREATE INDEX alerts_status_idx ON public.alerts (status, created_at DESC);
GRANT SELECT ON public.alerts TO authenticated;
GRANT ALL ON public.alerts TO service_role;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff view alerts" ON public.alerts
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

-- ===== Stock audits =====
CREATE TABLE public.stock_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id uuid NOT NULL REFERENCES public.medicines(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  recorded_quantity integer NOT NULL,
  physical_quantity integer NOT NULL CHECK (physical_quantity >= 0),
  discrepancy integer NOT NULL,
  notes text,
  adjusted boolean NOT NULL DEFAULT false,
  adjusted_at timestamptz,
  adjusted_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_audits_created_idx ON public.stock_audits (created_at DESC);
GRANT SELECT ON public.stock_audits TO authenticated;
GRANT ALL ON public.stock_audits TO service_role;
ALTER TABLE public.stock_audits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins and storekeepers view audits" ON public.stock_audits
  FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','storekeeper']::public.app_role[]));

-- ===== Alert engine: evaluate thresholds whenever stock or minimum changes =====
CREATE OR REPLACE FUNCTION public.evaluate_medicine_alerts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT NEW.is_active THEN
    UPDATE public.alerts SET status = 'RESOLVED', resolved_at = now(), resolved_by_name = 'System (medicine archived)'
    WHERE medicine_id = NEW.id AND status = 'ACTIVE';
    RETURN NEW;
  END IF;

  IF NEW.current_stock = 0 THEN
    UPDATE public.alerts SET status = 'RESOLVED', resolved_at = now(), resolved_by_name = 'System (now out of stock)'
    WHERE medicine_id = NEW.id AND status = 'ACTIVE' AND alert_type = 'LOW_STOCK';
    IF NOT EXISTS (SELECT 1 FROM public.alerts WHERE medicine_id = NEW.id AND status = 'ACTIVE' AND alert_type = 'OUT_OF_STOCK') THEN
      INSERT INTO public.alerts (medicine_id, alert_type, message)
      VALUES (NEW.id, 'OUT_OF_STOCK', format('%s is out of stock. Restock immediately.', NEW.name));
    END IF;
  ELSIF NEW.current_stock <= NEW.minimum_level THEN
    UPDATE public.alerts SET status = 'RESOLVED', resolved_at = now(), resolved_by_name = 'System (partially restocked)'
    WHERE medicine_id = NEW.id AND status = 'ACTIVE' AND alert_type = 'OUT_OF_STOCK';
    IF EXISTS (SELECT 1 FROM public.alerts WHERE medicine_id = NEW.id AND status = 'ACTIVE' AND alert_type = 'LOW_STOCK') THEN
      UPDATE public.alerts
      SET message = format('%s is low: %s %s left (minimum %s).', NEW.name, NEW.current_stock, NEW.unit, NEW.minimum_level)
      WHERE medicine_id = NEW.id AND status = 'ACTIVE' AND alert_type = 'LOW_STOCK';
    ELSE
      INSERT INTO public.alerts (medicine_id, alert_type, message)
      VALUES (NEW.id, 'LOW_STOCK', format('%s is low: %s %s left (minimum %s).', NEW.name, NEW.current_stock, NEW.unit, NEW.minimum_level));
    END IF;
  ELSE
    UPDATE public.alerts SET status = 'RESOLVED', resolved_at = now(), resolved_by_name = 'System (restocked)'
    WHERE medicine_id = NEW.id AND status = 'ACTIVE';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.evaluate_medicine_alerts() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER medicines_evaluate_alerts
  AFTER INSERT OR UPDATE OF current_stock, minimum_level, is_active, name, unit ON public.medicines
  FOR EACH ROW EXECUTE FUNCTION public.evaluate_medicine_alerts();

-- Catalogue changes go to the activity log
CREATE OR REPLACE FUNCTION public.log_medicine_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._write_log('MEDICINE_ADDED', format('Added %s (%s, minimum %s)', NEW.name, NEW.category, NEW.minimum_level));
  ELSIF (OLD.name, OLD.generic_name, OLD.category, OLD.unit, OLD.minimum_level, OLD.unit_price)
        IS DISTINCT FROM (NEW.name, NEW.generic_name, NEW.category, NEW.unit, NEW.minimum_level, NEW.unit_price) THEN
    PERFORM public._write_log('MEDICINE_UPDATED', format('Updated %s (minimum %s → %s, price %s → %s)', NEW.name, OLD.minimum_level, NEW.minimum_level, OLD.unit_price, NEW.unit_price));
  ELSIF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
    PERFORM public._write_log(CASE WHEN NEW.is_active THEN 'MEDICINE_RESTORED' ELSE 'MEDICINE_ARCHIVED' END, NEW.name);
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.log_medicine_changes() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER medicines_log_changes
  AFTER INSERT OR UPDATE ON public.medicines
  FOR EACH ROW EXECUTE FUNCTION public.log_medicine_changes();

-- ===== Transaction engine =====
CREATE OR REPLACE FUNCTION public.record_stock_in(_medicine_id uuid, _quantity integer, _supplier text DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_med public.medicines%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT public.has_any_role(v_uid, ARRAY['admin','storekeeper']::public.app_role[]) THEN
    RAISE EXCEPTION 'You are not allowed to record stock-in' USING ERRCODE = '42501';
  END IF;
  IF _quantity IS NULL OR _quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than zero';
  END IF;
  SELECT * INTO v_med FROM public.medicines WHERE id = _medicine_id FOR UPDATE;
  IF NOT FOUND OR NOT v_med.is_active THEN
    RAISE EXCEPTION 'Medicine not found';
  END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;

  UPDATE public.medicines SET current_stock = current_stock + _quantity WHERE id = _medicine_id;
  INSERT INTO public.stock_transactions (medicine_id, user_id, user_name, transaction_type, quantity, balance_after, unit_price, supplier, notes)
  VALUES (_medicine_id, v_uid, v_name, 'IN', _quantity, v_med.current_stock + _quantity, v_med.unit_price,
          nullif(trim(_supplier), ''), nullif(trim(_notes), ''))
  RETURNING id INTO v_id;

  PERFORM public._write_log('STOCK_IN', format('Received %s %s of %s%s', _quantity, v_med.unit, v_med.name,
    CASE WHEN nullif(trim(_supplier), '') IS NULL THEN '' ELSE ' from ' || trim(_supplier) END));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.record_sale(_items jsonb, _customer_name text DEFAULT NULL, _notes text DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_receipt text;
  v_med public.medicines%ROWTYPE;
  v_count integer := 0;
  r record;
BEGIN
  IF NOT public.has_any_role(v_uid, ARRAY['admin','pharmacist']::public.app_role[]) THEN
    RAISE EXCEPTION 'You are not allowed to record stock-out' USING ERRCODE = '42501';
  END IF;
  IF _items IS NULL OR jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Add at least one medicine';
  END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;
  v_receipt := 'RCP-' || to_char(now(), 'YYMMDD') || '-' || lpad(nextval('public.receipt_seq')::text, 5, '0');

  FOR r IN
    SELECT (e->>'medicine_id')::uuid AS medicine_id, sum((e->>'quantity')::integer) AS qty
    FROM jsonb_array_elements(_items) e
    GROUP BY 1 ORDER BY 1
  LOOP
    IF r.qty IS NULL OR r.qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be greater than zero';
    END IF;
    SELECT * INTO v_med FROM public.medicines WHERE id = r.medicine_id FOR UPDATE;
    IF NOT FOUND OR NOT v_med.is_active THEN
      RAISE EXCEPTION 'Medicine not found';
    END IF;
    IF v_med.current_stock < r.qty THEN
      RAISE EXCEPTION 'Insufficient stock for %: only % % available', v_med.name, v_med.current_stock, v_med.unit;
    END IF;
    UPDATE public.medicines SET current_stock = current_stock - r.qty WHERE id = r.medicine_id;
    INSERT INTO public.stock_transactions (medicine_id, user_id, user_name, transaction_type, quantity, balance_after, unit_price, receipt_no, customer_name, notes)
    VALUES (r.medicine_id, v_uid, v_name, 'OUT', r.qty, v_med.current_stock - r.qty, v_med.unit_price, v_receipt,
            nullif(trim(_customer_name), ''), nullif(trim(_notes), ''));
    v_count := v_count + 1;
  END LOOP;

  PERFORM public._write_log('STOCK_OUT', format('Issued receipt %s (%s item%s)', v_receipt, v_count, CASE WHEN v_count = 1 THEN '' ELSE 's' END));
  RETURN v_receipt;
END $$;

CREATE OR REPLACE FUNCTION public.record_audit(_medicine_id uuid, _physical_quantity integer, _notes text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_med public.medicines%ROWTYPE;
  v_id uuid;
  v_disc integer;
BEGIN
  IF NOT public.has_any_role(v_uid, ARRAY['admin','storekeeper']::public.app_role[]) THEN
    RAISE EXCEPTION 'You are not allowed to record stock audits' USING ERRCODE = '42501';
  END IF;
  IF _physical_quantity IS NULL OR _physical_quantity < 0 THEN
    RAISE EXCEPTION 'Physical count cannot be negative';
  END IF;
  SELECT * INTO v_med FROM public.medicines WHERE id = _medicine_id FOR UPDATE;
  IF NOT FOUND OR NOT v_med.is_active THEN
    RAISE EXCEPTION 'Medicine not found';
  END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;
  v_disc := _physical_quantity - v_med.current_stock;

  INSERT INTO public.stock_audits (medicine_id, user_id, user_name, recorded_quantity, physical_quantity, discrepancy, notes)
  VALUES (_medicine_id, v_uid, v_name, v_med.current_stock, _physical_quantity, v_disc, nullif(trim(_notes), ''))
  RETURNING id INTO v_id;

  PERFORM public._write_log('STOCK_AUDIT', format('Counted %s: recorded %s, physical %s, discrepancy %s',
    v_med.name, v_med.current_stock, _physical_quantity, v_disc));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.apply_audit_adjustment(_audit_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_audit public.stock_audits%ROWTYPE;
  v_med public.medicines%ROWTYPE;
  v_new integer;
BEGIN
  IF NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'Only administrators can apply audit adjustments' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_audit FROM public.stock_audits WHERE id = _audit_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Audit not found'; END IF;
  IF v_audit.adjusted THEN RAISE EXCEPTION 'This audit has already been applied'; END IF;
  IF v_audit.discrepancy = 0 THEN RAISE EXCEPTION 'This audit has no discrepancy to apply'; END IF;

  SELECT * INTO v_med FROM public.medicines WHERE id = v_audit.medicine_id FOR UPDATE;
  v_new := v_med.current_stock + v_audit.discrepancy;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'Adjustment would make stock negative (current stock is %)', v_med.current_stock;
  END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = v_uid;

  UPDATE public.medicines SET current_stock = v_new WHERE id = v_med.id;
  INSERT INTO public.stock_transactions (medicine_id, user_id, user_name, transaction_type, quantity, balance_after, unit_price, notes)
  VALUES (v_med.id, v_uid, v_name, 'ADJUST', v_audit.discrepancy, v_new, v_med.unit_price,
          format('Audit adjustment (counted %s, recorded %s)', v_audit.physical_quantity, v_audit.recorded_quantity));
  UPDATE public.stock_audits SET adjusted = true, adjusted_at = now(), adjusted_by_name = v_name WHERE id = _audit_id;

  PERFORM public._write_log('AUDIT_ADJUSTMENT', format('Adjusted %s by %s (now %s)', v_med.name, v_audit.discrepancy, v_new));
END $$;

CREATE OR REPLACE FUNCTION public.resolve_alert(_alert_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name text;
  v_msg text;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT full_name INTO v_name FROM public.profiles WHERE id = auth.uid();
  UPDATE public.alerts SET status = 'RESOLVED', resolved_at = now(), resolved_by_name = v_name
  WHERE id = _alert_id AND status = 'ACTIVE'
  RETURNING message INTO v_msg;
  IF v_msg IS NOT NULL THEN
    PERFORM public._write_log('ALERT_RESOLVED', v_msg);
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.record_stock_in(uuid, integer, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_sale(jsonb, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_audit(uuid, integer, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_audit_adjustment(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_alert(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_in(uuid, integer, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_sale(jsonb, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_audit(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_audit_adjustment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_alert(uuid) TO authenticated;

-- ===== Reports (run with caller's permissions) =====
CREATE OR REPLACE FUNCTION public.monthly_report(_month_start date, _category text DEFAULT NULL)
RETURNS TABLE (medicine_id uuid, name text, category text, unit text, received bigint, issued bigint, transactions bigint, sales_value numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT m.id, m.name, m.category, m.unit,
    coalesce(sum(t.quantity) FILTER (WHERE t.transaction_type = 'IN'), 0)::bigint,
    coalesce(sum(t.quantity) FILTER (WHERE t.transaction_type = 'OUT'), 0)::bigint,
    count(t.id)::bigint,
    coalesce(sum(t.quantity * t.unit_price) FILTER (WHERE t.transaction_type = 'OUT'), 0)::numeric
  FROM public.medicines m
  JOIN public.stock_transactions t ON t.medicine_id = m.id
    AND t.created_at >= _month_start
    AND t.created_at < (_month_start + interval '1 month')
  WHERE (_category IS NULL OR m.category = _category)
  GROUP BY m.id, m.name, m.category, m.unit
  ORDER BY 6 DESC, 5 DESC, m.name
$$;

CREATE OR REPLACE FUNCTION public.daily_movement(_month_start date, _category text DEFAULT NULL)
RETURNS TABLE (day date, received bigint, issued bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT (t.created_at AT TIME ZONE 'Africa/Nairobi')::date AS day,
    coalesce(sum(t.quantity) FILTER (WHERE t.transaction_type = 'IN'), 0)::bigint,
    coalesce(sum(t.quantity) FILTER (WHERE t.transaction_type = 'OUT'), 0)::bigint
  FROM public.stock_transactions t
  JOIN public.medicines m ON m.id = t.medicine_id
  WHERE t.created_at >= _month_start
    AND t.created_at < (_month_start + interval '1 month')
    AND (_category IS NULL OR m.category = _category)
  GROUP BY 1 ORDER BY 1
$$;
REVOKE EXECUTE ON FUNCTION public.monthly_report(date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.daily_movement(date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.monthly_report(date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.daily_movement(date, text) TO authenticated;

-- ===== Live updates =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.medicines, public.alerts, public.stock_transactions;

-- ===== Starter catalogue =====
INSERT INTO public.medicines (name, generic_name, category, unit, current_stock, minimum_level, unit_price) VALUES
  ('Amoxicillin 500mg Capsules', 'Amoxicillin', 'Antibiotics', 'Strip', 120, 30, 150.00),
  ('Azithromycin 500mg Tablets', 'Azithromycin', 'Antibiotics', 'Strip', 18, 20, 450.00),
  ('Ciprofloxacin 500mg Tablets', 'Ciprofloxacin', 'Antibiotics', 'Strip', 0, 15, 220.00),
  ('Paracetamol 500mg Tablets', 'Paracetamol', 'Analgesics', 'Strip', 340, 50, 50.00),
  ('Ibuprofen 400mg Tablets', 'Ibuprofen', 'Analgesics', 'Strip', 95, 40, 80.00),
  ('Artemether/Lumefantrine 20/120mg', 'Artemether + Lumefantrine', 'Antimalarials', 'Pack', 12, 25, 350.00),
  ('Metformin 500mg Tablets', 'Metformin', 'Antidiabetics', 'Strip', 160, 40, 120.00),
  ('Amlodipine 5mg Tablets', 'Amlodipine', 'Cardiovascular', 'Strip', 75, 30, 180.00),
  ('Losartan 50mg Tablets', 'Losartan', 'Cardiovascular', 'Strip', 0, 20, 260.00),
  ('Omeprazole 20mg Capsules', 'Omeprazole', 'Gastrointestinal', 'Strip', 88, 25, 140.00),
  ('Oral Rehydration Salts', 'ORS', 'Gastrointestinal', 'Sachet', 210, 60, 30.00),
  ('Zinc Sulphate 20mg Dispersible', 'Zinc sulphate', 'Supplements', 'Strip', 9, 20, 90.00),
  ('Cetirizine 10mg Tablets', 'Cetirizine', 'Antihistamines', 'Strip', 64, 20, 70.00),
  ('Salbutamol 100mcg Inhaler', 'Salbutamol', 'Respiratory', 'Inhaler', 14, 10, 550.00),
  ('Dextromethorphan Cough Syrup 100ml', 'Dextromethorphan', 'Respiratory', 'Bottle', 42, 15, 280.00);
