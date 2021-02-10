import './TensorFlowNeuron.scss';
import React from 'react';

function TensorFlowNeuron({neuron}) {

  neuron.ref = React.createRef();

  return (
    <div className="TensorFlowNeuron" ref={neuron.ref}>
      <div
        className="TensorFlowNeuron-fill"
        style={{ opacity: neuron.weight / 2 }}
        title={neuron.weight}
      ></div>
    </div>
  );

}

export default TensorFlowNeuron;
