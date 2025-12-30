import { useLocation, useNavigate } from "react-router-dom";
import { readPreviousRoute } from "../previousRoute";

export default function BackBreadcrumb() {
  const navigate = useNavigate();
  const location = useLocation();
  const current = `${location.pathname}${location.search}`;
  const previous = readPreviousRoute();
  function handleBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    if (previous && previous !== current) {
      navigate(previous);
      return;
    }
    navigate("/");
  }

  return (
    <button className="breadcrumbBack" type="button" onClick={handleBack} aria-label="Back">
      <svg className="breadcrumbBackIcon" viewBox="0 0 20 20" aria-hidden="true">
        <path d="M12.5 4.5 7 10l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
