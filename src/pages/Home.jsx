export default function Home() {
  const season = 2024;

  return (
    <div>
      <h2>Season {season}</h2>

      <table border="1" cellPadding="6" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th>Week</th>
            <th>Away</th>
            <th>Home</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>1</td>
            <td>Air Force</td>
            <td>Michigan</td>
            <td>—</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Michigan</td>
            <td>Air Force</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}