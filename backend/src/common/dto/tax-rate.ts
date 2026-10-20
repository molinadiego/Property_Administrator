import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Tax rates (spec etapa-7.md §3): decimal percentage strings with up to 3
 * decimals in the range [0, 100] — Nevada combines 6.85–8.375% by county
 * (§11.6). `null` clears a draft override. Never floats: the value travels as
 * a string and is handled as integer thousandths internally (etapa-7.md D1).
 */
export const TAX_RATE_PATTERN = /^\d{1,3}(\.\d{1,3})?$/;

export function isValidTaxRate(value: unknown): boolean {
  if (value === null) return true;
  return typeof value === 'string' && TAX_RATE_PATTERN.test(value) && Number(value) <= 100;
}

export function IsTaxRate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isTaxRate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return isValidTaxRate(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} debe ser una tasa entre 0 y 100 con hasta 3 decimales (ej. "8.375") o null.`;
        },
      },
    });
  };
}
