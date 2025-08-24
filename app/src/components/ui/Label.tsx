import type { LabelHTMLAttributes } from 'react';
import clsx from 'clsx';

export default function Label(props: LabelHTMLAttributes<HTMLLabelElement>) {
	const { className, ...rest } = props;
	return <label className={clsx('block text-xs font-medium text-gray-700', className)} {...rest} />;
}