-- Evita pagos duplicados por integrante, tipo, año y mes.
-- Ejecutar en Supabase SQL Editor cuando se quiera limpiar la base y bloquear duplicados a nivel de base de datos.

with ranked as (
  select
    id,
    row_number() over (
      partition by member_id, tipo_pago, anio, mes
      order by updated_at desc nulls last, created_at desc nulls last, fecha_pago desc nulls last
    ) as rn
  from public.tesoreria_cuotas_pagos
)
delete from public.tesoreria_cuotas_pagos p
using ranked r
where p.id = r.id
  and r.rn > 1;

create unique index if not exists tesoreria_cuotas_pagos_unicos_idx
on public.tesoreria_cuotas_pagos (member_id, tipo_pago, anio, mes);
