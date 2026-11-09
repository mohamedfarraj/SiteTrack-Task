import { Transform } from 'class-transformer';

/**
 * Query strings are always text, so "false" would be truthy after implicit
 * conversion. This maps "true"/"1" -> true and "false"/"0" -> false.
 */
export const ToBoolean = () =>
  Transform(({ obj, key }) => {
    const raw = obj[key];
    if (raw === undefined || raw === null || raw === '') return undefined;
    if (typeof raw === 'boolean') return raw;
    return ['true', '1', 'yes'].includes(String(raw).toLowerCase());
  });

/** Accepts `?status=A&status=B` or `?status=A,B` and always yields an array. */
export const ToArray = () =>
  Transform(({ value }) => {
    if (value === undefined || value === null || value === '') return undefined;
    const list = Array.isArray(value) ? value : String(value).split(',');
    return list.map((v) => String(v).trim()).filter(Boolean);
  });
