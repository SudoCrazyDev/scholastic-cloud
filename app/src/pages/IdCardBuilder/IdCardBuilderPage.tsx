import { useSearchParams } from 'react-router-dom';
import IdCardBuilder from './IdCardBuilder';
import IdCardList from './IdCardList';

/**
 * Student ID Builder entry: show the list of ID templates for the institution first.
 * When ?id= is present, show the builder (edit). Use /id-card-builder/new for a new template.
 */
export default function IdCardBuilderPage() {
	const [searchParams] = useSearchParams();
	const templateId = searchParams.get('id');

	if (templateId) {
		return <IdCardBuilder />;
	}

	return <IdCardList />;
}
