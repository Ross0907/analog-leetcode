import type { Challenge } from "../../lib/challenges";
import styles from "./converter-block-diagram.module.css";

export function ConverterBlockDiagram({ diagram }: { diagram: NonNullable<Challenge["blocks"]> }) {
  return (
    <figure className={styles.diagram} aria-label={diagram.title}>
      <figcaption>{diagram.title}</figcaption>
      <ol className={styles.stages}>
        {diagram.stages.map((stage, index) => <li key={stage.name}>
          <span className={styles.number} aria-hidden="true">{index + 1}</span>
          <strong>{stage.name}</strong><p>{stage.detail}</p>
        </li>)}
      </ol>
      <ul className={styles.connections} aria-label="Signal connections">
        {diagram.connections.map((connection) => <li key={`${connection.from}-${connection.to}`}>
          <span>{diagram.stages[connection.from].name} <span aria-label="to">→</span> {diagram.stages[connection.to].name}</span>
          <small>{connection.signal}</small>
        </li>)}
      </ul>
    </figure>
  );
}
