export const bases = [2, 8, 10, 16] as const;
export type Base = (typeof bases)[number];
export function numeral(raw: string, base: number) {
  if (!bases.some((value) => value === base))
    throw new RangeError('Выбери основание 2, 8, 10 или 16.');
  const text = raw.trim().toUpperCase();
  if (!/^[0-9A-F]{1,16}$/u.test(text))
    throw new RangeError('Введи от 1 до 16 цифр без пробелов внутри записи.');
  const digits = Array.from(text, (digit) => '0123456789ABCDEF'.indexOf(digit));
  if (digits.some((digit) => digit >= base))
    throw new RangeError('Каждая цифра должна быть меньше основания.');
  const exact = digits.map((digit, index) => {
    const power = digits.length - index - 1,
      weight = BigInt(base) ** BigInt(power);
    return { digit, power, weight, value: BigInt(digit) * weight };
  });
  const value = exact.reduce((sum, term) => sum + term.value, 0n);
  if (value > 65535n)
    throw new RangeError(
      'В этой лаборатории допустимы значения от 0 до 65535.',
    );
  const terms = exact.map((term) => ({
    ...term,
    weight: term.weight.toString(),
    value: Number(term.value),
  }));
  return { text, terms, value: Number(value) };
}
export function convert(value: number, base: Base) {
  if (!Number.isInteger(value) || value < 0 || value > 65535)
    throw new RangeError('Нужно целое число от 0 до 65535.');
  if (!bases.includes(base)) throw new RangeError('Неизвестное основание.');
  let rest = value;
  const divisions: { dividend: number; quotient: number; remainder: number }[] =
    [];
  do {
    const quotient = Math.floor(rest / base),
      remainder = rest % base;
    divisions.push({ dividend: rest, quotient, remainder });
    rest = quotient;
  } while (rest > 0);
  return {
    divisions,
    text: divisions
      .map(({ remainder }) => '0123456789ABCDEF'[remainder])
      .reverse()
      .join(''),
  };
}
export function numeralSum(binary: string, octal: string, hexadecimal: string) {
  return (
    numeral(binary, 2).value +
    numeral(octal, 8).value +
    numeral(hexadecimal, 16).value
  );
}
