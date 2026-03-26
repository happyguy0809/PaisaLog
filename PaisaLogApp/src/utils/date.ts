// src/utils/date.ts
// ALL date formatting goes through here. Never call dayjs().format() directly.
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
dayjs.extend(utc);
dayjs.extend(timezone);

export function format_date(
  utc_ts: string | number | Date,
  tz: string,
  fmt: string = 'D MMM YYYY'
): string {
  try { return dayjs(utc_ts).tz(tz).format(fmt); }
  catch { return dayjs(utc_ts).format(fmt); }
}

export function format_date_with_offset(
  utc_ts: string | number | Date,
  tz_offset: string,
  fmt: string = 'D MMM YYYY'
): string {
  try {
    const sign = tz_offset[0];
    const [h, m] = tz_offset.slice(1).split(':').map(Number);
    const mins = (h * 60 + (m || 0)) * (sign === '-' ? -1 : 1);
    return dayjs(utc_ts).utcOffset(mins).format(fmt);
  } catch { return dayjs(utc_ts).format(fmt); }
}

export function get_tz_offset(tz: string): string {
  try {
    const offset_mins = dayjs().tz(tz).utcOffset();
    const sign = offset_mins >= 0 ? '+' : '-';
    const abs  = Math.abs(offset_mins);
    const h    = String(Math.floor(abs / 60)).padStart(2, '0');
    const m    = String(abs % 60).padStart(2, '0');
    return `${sign}${h}:${m}`;
  } catch { return '+00:00'; }
}

export function today_local(tz: string): string {
  try { return dayjs().tz(tz).format('YYYY-MM-DD'); }
  catch { return dayjs().format('YYYY-MM-DD'); }
}

export function time_ago(utc_ts: string | number, tz: string): string {
  try {
    const d     = dayjs(utc_ts).tz(tz);
    const now   = dayjs().tz(tz);
    const diff_m = now.diff(d, 'minute');
    if (diff_m < 1)  return 'just now';
    if (diff_m < 60) return `${diff_m}m ago`;
    const diff_h = now.diff(d, 'hour');
    if (diff_h < 24) return `${diff_h}h ago`;
    if (diff_h < 48) return 'yesterday';
    const diff_d = now.diff(d, 'day');
    if (diff_d < 7)  return `${diff_d}d ago`;
    return d.format('D MMM');
  } catch { return dayjs(utc_ts).format('D MMM'); }
}
