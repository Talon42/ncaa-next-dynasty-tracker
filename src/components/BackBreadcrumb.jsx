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
    <button className="breadcrumbBack" type="button" onClick={handleBack}>
      Back
    </button>
  );
}
