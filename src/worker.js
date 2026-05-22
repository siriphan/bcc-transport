// BCC Transport Management - Cloudflare Worker
// Database: bcc-transport (527776ee-49d0-4a87-9fdf-b489123ce7dd)

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
const err = (msg, status = 500) => json({ error: String(msg) }, status);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    if (method === "OPTIONS") return new Response(null, { headers: CORS });
    if (!pathname.startsWith("/api/")) return env.ASSETS.fetch(request);

    try {
      const db = env.DB;

      if (pathname === "/api/vehicles" && method === "GET") {
        const { results } = await db.prepare("SELECT * FROM vehicles ORDER BY plate").all();
        return json(results);
      }

      if (pathname === "/api/drivers" && method === "GET") {
        const { results } = await db.prepare(
          "SELECT * FROM drivers WHERE status='Active' ORDER BY nickname"
        ).all();
        return json(results);
      }

      if (pathname === "/api/trips" && method === "GET") {
        const date = url.searchParams.get("date");
        const sql = `SELECT t.*, d.nickname AS driver_name
                     FROM trips t LEFT JOIN drivers d ON t.driver_id = d.id
                     ${date ? "WHERE t.trip_date = ?" : ""}
                     ORDER BY t.trip_date DESC, t.time_slot`;
        const stmt = date ? db.prepare(sql).bind(date) : db.prepare(sql);
        const { results } = await stmt.all();
        return json(results);
      }

      if (pathname === "/api/trips" && method === "POST") {
        const b = await request.json();
        const code = "TR-" + Date.now();
        await db.prepare(
          `INSERT INTO trips (trip_code, trip_date, plate, driver_id, job_name, job_site,
                              distance_km, plan_date, time_slot, status)
           VALUES (?,?,?,?,?,?,?,?,?,?)`
        ).bind(code, b.trip_date, b.plate, b.driver_id, b.job_name, b.job_site,
               b.distance_km, b.plan_date, b.time_slot, b.status || "วางแผน").run();
        return json({ ok: true, trip_code: code });
      }

      const tripMatch = pathname.match(/^\/api\/trips\/(\d+)$/);
      if (tripMatch && method === "PATCH") {
        const id = tripMatch[1];
        const b = await request.json();
        const fields = [], vals = [];
        if (b.status)      { fields.push("status = ?");      vals.push(b.status); }
        if (b.actual_date) { fields.push("actual_date = ?"); vals.push(b.actual_date); }
        if (!fields.length) return err("No fields to update", 400);
        vals.push(id);
        await db.prepare(`UPDATE trips SET ${fields.join(", ")} WHERE id = ?`).bind(...vals).run();
        return json({ ok: true });
      }

      if (pathname === "/api/fuel" && method === "GET") {
        const { results } = await db.prepare(
          "SELECT * FROM fuel_log ORDER BY log_date DESC LIMIT 100"
        ).all();
        return json(results);
      }

      if (pathname === "/api/fuel" && method === "POST") {
        const b = await request.json();
        await db.prepare(
          `INSERT INTO fuel_log (log_date, plate, liters, price_per_liter, odometer_km)
           VALUES (?,?,?,?,?)`
        ).bind(b.log_date, b.plate, b.liters, b.price_per_liter, b.odometer_km).run();
        if (b.odometer_km) {
          await db.prepare("UPDATE vehicles SET current_km = ? WHERE plate = ?")
            .bind(b.odometer_km, b.plate).run();
        }
        return json({ ok: true });
      }

      if (pathname === "/api/maintenance" && method === "GET") {
        const { results } = await db.prepare(
          "SELECT * FROM maintenance_log ORDER BY log_date DESC"
        ).all();
        return json(results);
      }

      if (pathname === "/api/maintenance" && method === "POST") {
        const b = await request.json();
        await db.prepare(
          `INSERT INTO maintenance_log (log_date, plate, repair_type, cost, garage, notes)
           VALUES (?,?,?,?,?,?)`
        ).bind(b.log_date, b.plate, b.repair_type, b.cost, b.garage, b.notes || "").run();
        return json({ ok: true });
      }

      if (pathname === "/api/oilchange" && method === "GET") {
        const { results } = await db.prepare(
          "SELECT * FROM oil_change_log ORDER BY log_date DESC"
        ).all();
        return json(results);
      }

      if (pathname === "/api/oilchange" && method === "POST") {
        const b = await request.json();
        await db.prepare(
          `INSERT INTO oil_change_log (log_date, plate, odometer_km, cost, notes)
           VALUES (?,?,?,?,?)`
        ).bind(b.log_date, b.plate, b.odometer_km, b.cost, b.notes || "").run();
        await db.prepare(
          `UPDATE vehicles SET last_oil_change_date = ?, last_oil_change_km = ? WHERE plate = ?`
        ).bind(b.log_date, b.odometer_km, b.plate).run();
        return json({ ok: true });
      }

      if (pathname === "/api/alerts" && method === "GET") {
        const { results } = await db.prepare(
          `SELECT *,
              CAST(julianday('now') - julianday(last_oil_change_date) AS INTEGER) AS days_since,
              (current_km - last_oil_change_km) AS km_since,
              CASE
                WHEN (julianday('now') - julianday(last_oil_change_date)) >= oil_change_days
                 AND (current_km - last_oil_change_km) >= oil_change_km
                THEN 'ครบทั้งระยะวัน + กม.'
                WHEN (julianday('now') - julianday(last_oil_change_date)) >= oil_change_days
                THEN 'ครบระยะวัน'
                ELSE 'ครบระยะ กม.'
              END AS reason
           FROM vehicles
           WHERE (julianday('now') - julianday(last_oil_change_date)) >= oil_change_days
              OR (current_km - last_oil_change_km) >= oil_change_km
           ORDER BY plate`
        ).all();
        return json(results);
      }

      if (pathname === "/api/report/fuel" && method === "GET") {
        const from = url.searchParams.get("from") || "1900-01-01";
        const to   = url.searchParams.get("to")   || "2999-12-31";
        const { results } = await db.prepare(
          `SELECT v.plate, v.vehicle_type,
              IFNULL((SELECT SUM(distance_km) FROM trips
                      WHERE plate=v.plate AND status='ส่งแล้ว'
                        AND trip_date BETWEEN ? AND ?),0) AS total_km,
              IFNULL((SELECT SUM(liters) FROM fuel_log
                      WHERE plate=v.plate
                        AND log_date BETWEEN ? AND ?),0) AS total_liters
           FROM vehicles v ORDER BY v.plate`
        ).bind(from, to, from, to).all();
        const rows = results.map(r => ({
          ...r,
          km_per_liter: r.total_liters > 0 ? +(r.total_km / r.total_liters).toFixed(2) : 0,
        }));
        return json(rows);
      }

      if (pathname === "/api/dashboard" && method === "GET") {
        const today = new Date().toISOString().slice(0,10);
        const month = today.slice(0,7);
        const q = async (sql, ...bind) => {
          const stmt = bind.length ? db.prepare(sql).bind(...bind) : db.prepare(sql);
          const { results } = await stmt.all();
          return results[0];
        };
        const k1 = await q("SELECT COUNT(*) AS c FROM trips WHERE trip_date = ?", today);
        const k2 = await q("SELECT COUNT(*) AS c FROM trips WHERE trip_date = ? AND status='ส่งแล้ว'", today);
        const k3 = await q("SELECT COUNT(*) AS c FROM vehicles WHERE status='พร้อมใช้'");
        const k4 = await q("SELECT IFNULL(SUM(cost),0) AS c FROM maintenance_log WHERE substr(log_date,1,7) = ?", month);
        const km  = await q("SELECT IFNULL(SUM(distance_km),0) AS s FROM trips WHERE substr(trip_date,1,7)=? AND status='ส่งแล้ว'", month);
        const lit = await q("SELECT IFNULL(SUM(liters),0) AS s FROM fuel_log WHERE substr(log_date,1,7)=?", month);
        const k6 = await q(
          `SELECT COUNT(*) AS c FROM vehicles
            WHERE (julianday('now')-julianday(last_oil_change_date)) >= oil_change_days
               OR (current_km - last_oil_change_km) >= oil_change_km`
        );
        return json({
          trips_today: k1.c,
          completed_today: k2.c,
          available_vehicles: k3.c,
          maintenance_cost_month: k4.c,
          avg_km_per_liter: lit.s > 0 ? +(km.s / lit.s).toFixed(2) : 0,
          vehicles_need_oil_change: k6.c,
        });
      }

      return err("Not found", 404);
    } catch (e) {
      return err(e.message || e, 500);
    }
  },
};
