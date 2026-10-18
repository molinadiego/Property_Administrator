import { registerDecorator, ValidationArguments, ValidationOptions } from 'class-validator';

/**
 * Money amounts (spec etapa-4.md §3): decimal strings with up to 2 decimals
 * and at most 10 integer digits (range [0, 9999999999.99]). Never floats:
 * the value travels as a string and is handled as integer cents internally.
 */
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/;

export function IsMoneyAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isMoneyAmount',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && MONEY_PATTERN.test(value);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} debe ser un importe decimal con hasta 2 decimales (ej. "1234.56").`;
        },
      },
    });
  };
}
